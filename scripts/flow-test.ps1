# API flow test against a running server (default: dev server http://localhost:3000).
#
# Safe by design: it never changes existing data. Anything it creates is named "[flow-test] ..."
# and is removed in the cleanup block (finally), even when a check fails.
# It does not create events (events cannot be deleted) and does not publish anything to other members.
#
# Part A (always): public API, login validation, endpoints must refuse anonymous calls.
# Part B (member login): set FLOW_MEMBER_NAME (or FLOW_MEMBER_ID) and FLOW_MEMBER_CODE (phone last 4 digits).
#   Reads /api/me, /api/events, /api/board, /api/unread, /api/profiles; admin APIs must refuse before the admin passcode.
# Part C (admin): also set FLOW_ADMIN_PASSCODE. The member must have admin perms.
#   - board: post visible only to the tester (audience = self, so no push to others), reaction toggle, comment, delete
#   - activity templates: new template v1 -> new version v2 -> delete v2, v1   (needs "activities" perm)
#   - dev requests: create -> delete                                              (needs "all" perm)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\flow-test.ps1 [-Base http://localhost:3000]
# Credentials come only from environment variables; this script never prints them.

param([string]$Base = 'http://localhost:3000')

$ErrorActionPreference = 'Continue'
$pass = 0; $fail = 0; $skip = 0
$TAG = '[flow-test]'
function Check($name, $cond) { if ($cond) { $script:pass++; "PASS  $name" } else { $script:fail++; "FAIL  $name" } }
function Skip($name) { $script:skip++; "SKIP  $name" }
function NewSession() { New-Object Microsoft.PowerShell.Commands.WebRequestSession }
function Call($method, $path, $body, $sess) {
  $p = @{ Uri = "$Base$path"; Method = $method; UseBasicParsing = $true; TimeoutSec = 30 }
  if ($sess) { $p.WebSession = $sess }
  if ($null -ne $body) {
    $json = $body | ConvertTo-Json -Depth 8
    $p.Body = [Text.Encoding]::UTF8.GetBytes($json); $p.ContentType = 'application/json; charset=utf-8'
  }
  try {
    $r = Invoke-WebRequest @p
    $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    $j = $null; try { $j = $text | ConvertFrom-Json } catch { }
    return @{ code = [int]$r.StatusCode; json = $j }
  } catch {
    $resp = $_.Exception.Response; $code = if ($resp) { [int]$resp.StatusCode } else { 0 }; $j = $null
    if ($resp) { try { $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8); $j = $sr.ReadToEnd() | ConvertFrom-Json } catch { } }
    return @{ code = $code; json = $j }
  }
}

# temp data to remove at the end: @{ kind; id }
$created = New-Object System.Collections.ArrayList
$admin = $null

try {
  # ===== Part A: anonymous =====
  $pub = Call 'GET' '/api/public/club' $null $null
  if ($pub.code -eq 0) { "Server not reachable at $Base"; $fail++; return }
  Check 'public club: 200' ($pub.code -eq 200)
  Check 'public club: has name and member list' ($pub.json.displayName -and $null -ne $pub.json.members)
  $leak = ($pub.json.members | ConvertTo-Json -Depth 3) -match '"(phone|company|birth|perms)"'
  Check 'public club: names only (no phone/company/birth/perms)' (-not $leak)

  $anon = NewSession
  foreach ($path in @('/api/me', '/api/events', '/api/board', '/api/unread', '/api/profiles', '/api/host', '/api/admin/members', '/api/admin/events', '/api/admin/templates')) {
    Check "anonymous blocked: $path" ((Call 'GET' $path $null $anon).code -eq 401)
  }
  Check 'login: empty body -> 400' ((Call 'POST' '/api/auth/login' @{} $anon).code -eq 400)
  Check 'login: unknown member -> 401' ((Call 'POST' '/api/auth/login' @{ memberId = 'flow-test-nobody'; code = '0000' } $anon).code -eq 401)
  Check 'admin passcode without login -> 403' ((Call 'POST' '/api/auth/admin' @{ passcode = 'x' } $anon).code -eq 403)

  # ===== Part B: member =====
  $mid = $env:FLOW_MEMBER_ID
  if (-not $mid -and $env:FLOW_MEMBER_NAME) { $mid = ($pub.json.members | Where-Object { $_.name -eq $env:FLOW_MEMBER_NAME } | Select-Object -First 1).id }
  if (-not $mid -or -not $env:FLOW_MEMBER_CODE) {
    Skip 'Part B/C: set FLOW_MEMBER_NAME (or FLOW_MEMBER_ID) and FLOW_MEMBER_CODE'
    return
  }
  $m = NewSession
  $login = Call 'POST' '/api/auth/login' @{ memberId = $mid; code = $env:FLOW_MEMBER_CODE } $m
  Check 'member login' ($login.code -eq 200)
  if ($login.code -ne 200) { return }
  $me = (Call 'GET' '/api/me' $null $m).json
  Check '/api/me: name and prefs' ($me.name -and $null -ne $me.prefs -and $me.admin -eq $false)
  $ev = Call 'GET' '/api/events' $null $m
  Check '/api/events: 200 with list' ($ev.code -eq 200 -and $null -ne $ev.json.events)
  $bd = Call 'GET' '/api/board' $null $m
  Check '/api/board: 200 with list' ($bd.code -eq 200 -and $null -ne $bd.json.posts)
  $un = (Call 'GET' '/api/unread' $null $m).json
  Check '/api/unread: counts' ($null -ne $un.events -and $null -ne $un.posts -and $null -ne $un.profiles -and $null -ne $un.alerts)
  Check '/api/profiles: 200' ((Call 'GET' '/api/profiles' $null $m).code -eq 200)
  Check 'admin API before passcode -> 403' ((Call 'GET' '/api/admin/events' $null $m).code -eq 403)

  # ===== Part C: admin =====
  if (-not $env:FLOW_ADMIN_PASSCODE) { Skip 'Part C: set FLOW_ADMIN_PASSCODE'; return }
  $perms = @($me.livePerms)
  if ($perms.Count -eq 0) { Skip 'Part C: this member has no admin perms'; return }
  $admin = $m
  Check 'admin passcode' ((Call 'POST' '/api/auth/admin' @{ passcode = $env:FLOW_ADMIN_PASSCODE } $admin).code -eq 200)
  Check '/api/me: admin true after passcode' ((Call 'GET' '/api/me' $null $admin).json.admin -eq $true)
  $isAll = $perms -contains 'all'
  $has = { param($p) $isAll -or ($perms -contains $p) }

  # --- board (needs all/board or club officer) ---
  if ($bd.json.me.canWrite) {
    $aud = @{ mode = 'members'; events = @(); clubs = @(); memberIds = @($mid) }
    Check 'board: minutes form refused' ((Call 'POST' '/api/board' @{ form = 'minutes'; title = "$TAG x"; audience = $aud } $admin).code -eq 400)
    Check 'board: fee form refused (managed screen only)' ((Call 'POST' '/api/board' @{ form = 'fee'; title = "$TAG x"; audience = $aud } $admin).code -eq 400)
    Check 'board: poll with 1 option refused' ((Call 'POST' '/api/board' @{ form = 'poll'; title = "$TAG x"; data = @{ options = @('a') }; audience = $aud } $admin).code -eq 400)
    $np = Call 'POST' '/api/board' @{ form = 'general'; title = "$TAG general post"; body = 'temp'; audience = $aud } $admin
    Check 'board: create general post (audience = self)' ($np.code -eq 200 -and $np.json.id)
    if ($np.json.id) {
      $postId = $np.json.id; [void]$created.Add(@{ kind = 'post'; id = $postId })
      $one = Call 'GET' "/api/board/$postId" $null $admin
      Check 'board: detail readable, talk present' ($one.code -eq 200 -and $null -ne $one.json.talk)
      $r1 = Call 'POST' "/api/board/$postId/reactions" @{ type = 'like' } $admin
      Check 'reaction on' ($r1.code -eq 200 -and $r1.json.on -eq $true)
      $r2 = Call 'POST' "/api/board/$postId/reactions" @{ type = 'like' } $admin
      Check 'reaction toggles off' ($r2.code -eq 200 -and $r2.json.on -eq $false)
      Check 'unknown reaction refused' ((Call 'POST' "/api/board/$postId/reactions" @{ type = 'nope' } $admin).code -eq 400)
      Check 'empty comment refused' ((Call 'POST' "/api/board/$postId/comments" @{ body = ' ' } $admin).code -eq 400)
      $c1 = Call 'POST' "/api/board/$postId/comments" @{ body = "$TAG comment" } $admin
      Check 'comment added' ($c1.code -eq 200 -and @($c1.json.comments).Count -eq 1)
      if (@($c1.json.comments).Count -ge 1) {
        $cid = $c1.json.comments[0].id
        Check 'comment deleted' ((Call 'DELETE' "/api/board/$postId/comments/$cid" $null $admin).code -eq 200)
      }
      Check 'board: post deleted' ((Call 'DELETE' "/api/board/$postId" $null $admin).code -eq 200)
      $created.Remove(($created | Where-Object { $_.id -eq $postId } | Select-Object -First 1))
      Check 'board: deleted post -> 404' ((Call 'GET' "/api/board/$postId" $null $admin).code -eq 404)
    }
  } else { Skip 'board writes: no board perm' }

  # --- activity templates (versions) ---
  if (& $has 'activities') {
    $tl = (Call 'GET' '/api/admin/templates' $null $admin).json.templates
    Check 'templates: default 3 present' ((@($tl | Where-Object { $_.origin -eq 'default' })).Count -ge 3)
    Check 'templates: default cannot be deleted' ((Call 'DELETE' '/api/admin/templates/who-am-i' $null $admin).code -eq 400)
    $cfg = @{ name = "$TAG template"; description = 'temp'; participants = 'all'; preEvent = @{ enabled = $false; steps = @() }
      onsite = @{ steps = @(@{ key = 'go'; label = 'start'; memberScreen = 'view'; unlock = 'immediate'; hostButton = 'start' }) }
      host = @{ required = $false } }
    $dup = @{ name = "$TAG dup"; preEvent = @{ enabled = $false; steps = @() }; onsite = @{ steps = @(@{ key = 'x'; label = 'a'; memberScreen = 'wait'; unlock = 'host_click' }, @{ key = 'x'; label = 'b'; memberScreen = 'wait'; unlock = 'host_click' }) } }
    Check 'templates: duplicate step keys refused' ((Call 'POST' '/api/admin/templates' $dup $admin).code -eq 400)
    $t1 = Call 'POST' '/api/admin/templates' $cfg $admin
    Check 'templates: create v1' ($t1.code -eq 200 -and $t1.json.template.version -eq 1)
    if ($t1.json.template.id) {
      $v1 = $t1.json.template.id; [void]$created.Add(@{ kind = 'template'; id = $v1 })
      $cfg.description = 'temp v2'
      $t2 = Call 'PUT' "/api/admin/templates/$v1" @{ config = $cfg; mode = 'version' } $admin
      Check 'templates: save as new version -> v2' ($t2.code -eq 200 -and $t2.json.template.version -eq 2 -and $t2.json.template.id -ne $v1)
      if ($t2.json.template.id -and $t2.json.template.id -ne $v1) {
        $v2 = $t2.json.template.id; [void]$created.Insert(0, @{ kind = 'template'; id = $v2 })
        Check 'templates: v1 not deletable while v2 exists' ((Call 'DELETE' "/api/admin/templates/$v1" $null $admin).code -eq 400)
        $t3 = Call 'PUT' "/api/admin/templates/$v2" @{ config = $cfg; mode = 'fix' } $admin
        Check 'templates: fix (same config) keeps version' ($t3.code -eq 200 -and $t3.json.template.version -eq 2)
      }
    }
  } else { Skip 'templates: no activities perm' }

  # --- dev requests (create needs activities; delete needs all) ---
  if ($isAll) {
    $dr = Call 'POST' '/api/admin/dev-requests' @{ title = "$TAG request"; detail = 'temp'; why = 'test' } $admin
    Check 'dev request: create' ($dr.code -eq 200 -and $dr.json.request.status)
    if ($dr.json.request.id) {
      $did = $dr.json.request.id; [void]$created.Add(@{ kind = 'dev'; id = $did })
      Check 'dev request: listed' ($null -ne ((Call 'GET' '/api/admin/dev-requests' $null $admin).json.requests | Where-Object { $_.id -eq $did }))
      Check 'dev request: bad status refused' ((Call 'PATCH' "/api/admin/dev-requests/$did" @{ status = 'nope' } $admin).code -eq 400)
    }
  } else { Skip 'dev requests: needs all perm' }
}
finally {
  # ===== cleanup (newest first) =====
  if ($admin -and $created.Count -gt 0) {
    $order = @($created | Where-Object { $_.kind -eq 'post' }) + @($created | Where-Object { $_.kind -eq 'dev' }) + @($created | Where-Object { $_.kind -eq 'template' })
    foreach ($x in $order) {
      $path = switch ($x.kind) { 'post' { "/api/board/$($x.id)" } 'dev' { "/api/admin/dev-requests/$($x.id)" } 'template' { "/api/admin/templates/$($x.id)" } }
      $c = (Call 'DELETE' $path $null $admin).code
      Check "cleanup $($x.kind) $($x.id)" ($c -eq 200 -or $c -eq 404)
    }
  }
  if ($admin) { Call 'POST' '/api/auth/logout' @{} $admin | Out-Null }
  ""
  "pass $pass / fail $fail / skip $skip"
}

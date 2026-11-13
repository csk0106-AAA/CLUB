// lunar-javascript(만세력) 중 이 앱이 쓰는 부분만 선언한다.
declare module "lunar-javascript" {
  interface DaYun { getStartAge(): number; getEndAge(): number; getGanZhi(): string }
  interface Yun { getStartYear(): number; getStartMonth(): number; getDaYun(n?: number): DaYun[] }
  interface EightChar {
    getYear(): string; getMonth(): string; getDay(): string; getTime(): string;
    getYearWuXing(): string; getMonthWuXing(): string; getDayWuXing(): string; getTimeWuXing(): string;
    getDayGan(): string;
    getYearShiShenGan(): string; getMonthShiShenGan(): string; getTimeShiShenGan(): string;
    getYearShiShenZhi(): string[]; getMonthShiShenZhi(): string[]; getDayShiShenZhi(): string[]; getTimeShiShenZhi(): string[];
    getYun(gender: number): Yun;
  }
  interface LunarObj { getEightChar(): EightChar; getSolar(): SolarObj }
  interface SolarObj { getLunar(): LunarObj; toYmd(): string; getYear(): number }
  export const Solar: { fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): SolarObj };
  export const Lunar: { fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): LunarObj };
}

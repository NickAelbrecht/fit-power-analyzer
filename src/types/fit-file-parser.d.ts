declare module 'fit-file-parser' {
  export default class FitParser {
    constructor();
    parse(buffer: ArrayBuffer, callback: (error: any, data: any) => void): void;
  }
}

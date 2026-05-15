export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

export const logger: Logger = {
  info(message: string) {
    process.stderr.write(`${message}\n`);
  },
  error(message: string) {
    process.stderr.write(`${message}\n`);
  }
};

import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class Logger {
  private static spinnerInstance: Ora | null = null;

  static banner(): void {
    console.log();
    console.log(
      chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗')
    );
    console.log(
      chalk.bold.cyan('║') +
        chalk.bold.magenta('                🚀  J O B - C U R A T O R                   ') +
        chalk.bold.cyan('║')
    );
    console.log(
      chalk.bold.cyan('║') +
        chalk.gray('      AI-Powered Dynamic Multi-Board Career Intelligence    ') +
        chalk.bold.cyan('║')
    );
    console.log(
      chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝')
    );
    console.log();
  }

  static info(message: string): void {
    console.log(`${chalk.blue('ℹ')} ${message}`);
  }

  static success(message: string): void {
    console.log(`${chalk.green('✔')} ${chalk.green(message)}`);
  }

  static warn(message: string): void {
    console.log(`${chalk.yellow('⚠')} ${chalk.yellow(message)}`);
  }

  static error(message: string): void {
    console.log(`${chalk.red('✖')} ${chalk.red(message)}`);
  }

  static section(title: string): void {
    console.log();
    console.log(chalk.bold.underline.cyan(`▶ ${title}`));
  }

  static step(stepNum: number, totalSteps: number, title: string): void {
    console.log();
    console.log(
      `${chalk.bold.bgCyan.black(` STEP ${stepNum}/${totalSteps} `)} ${chalk.bold.white(title)}`
    );
  }

  static spinner(text: string): Ora {
    if (this.spinnerInstance) {
      this.spinnerInstance.stop();
    }
    this.spinnerInstance = ora({
      text,
      color: 'cyan',
    }).start();
    return this.spinnerInstance;
  }

  static stopSpinner(success = true, text?: string): void {
    if (this.spinnerInstance) {
      if (success) {
        this.spinnerInstance.succeed(text);
      } else {
        this.spinnerInstance.fail(text);
      }
      this.spinnerInstance = null;
    }
  }

  static scoreColor(score: number): string {
    if (score >= 80) return chalk.green.bold(`${score}%`);
    if (score >= 60) return chalk.yellow.bold(`${score}%`);
    return chalk.red.bold(`${score}%`);
  }

  static recommendationBadge(recommendation: string): string {
    switch (recommendation) {
      case 'STRONG_MATCH':
        return chalk.bgGreen.black.bold(' STRONG MATCH ');
      case 'MODERATE_MATCH':
        return chalk.bgYellow.black.bold(' MODERATE MATCH ');
      case 'WEAK_MATCH':
        return chalk.bgGray.white.bold(' WEAK MATCH ');
      case 'REJECT_CONSTRAINTS':
        return chalk.bgRed.white.bold(' CONSTRAINTS FAILED ');
      default:
        return chalk.bgBlue.white.bold(` ${recommendation} `);
    }
  }
}

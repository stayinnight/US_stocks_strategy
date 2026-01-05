import fs from 'fs'
import { resolve } from 'path'

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug';

type Logger = {
    [K in LogLevel]: (...args: any[]) => void;
}

export const logger: Logger = {
    fatal: () => void 0,
    error: () => void 0,
    warn: () => void 0,
    info: () => void 0,
    debug: () => void 0,
};

const logDir = resolve(__dirname, '../log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const logLevelFiles = {
    fatal: resolve(logDir, 'fatal.log'),
    error: resolve(logDir, 'error.log'),
    warn: resolve(logDir, 'warn.log'),
    info: resolve(logDir, 'info.log'),
    debug: resolve(logDir, 'debug.log'),
}

const loggerStdout = (...args: any[]) => console.log(...args);

// create log files if not exist
for (const [logLevel, logFile] of Object.entries(logLevelFiles)) {
    if (!fs.existsSync(logFile)) {
        fs.writeFileSync(logFile, '');
    }
    logger[logLevel as LogLevel] = (...args: any[]) => {
        const stream = fs.createWriteStream(logFile, {
            flags: 'a' 
        });
        stream.write(`${new Date().toISOString()} `);
        stream.write(args.join(' ') + '\n');
        loggerStdout(...args);
        stream.end();
    };
}
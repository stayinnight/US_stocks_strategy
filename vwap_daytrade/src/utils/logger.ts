import fs from 'fs'
import { resolve, parse } from 'path'
import dayjs from 'dayjs'

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
    fatal: 'fatal.log',
    error: 'error.log',
    warn: 'warn.log',
    info: 'info.log',
    debug: 'debug.log',
}

const loggerStdout = (...args: any[]) => console.log(...args);

// create log files if not exist
for (const [logLevel, logFile] of Object.entries(logLevelFiles)) {
    const logFilePath = resolve(logDir, dayjs(Date.now()).format('YYYY-MM-DD'), logFile);
    if (!fs.existsSync(logFilePath)) {
        const logFileDir = parse(logFilePath).dir;
        fs.mkdirSync(logFileDir, { recursive: true });
        fs.writeFileSync(logFilePath, '');
    }
    logger[logLevel as LogLevel] = (...args: any[]) => {
        const stream = fs.createWriteStream(logFilePath, {
            flags: 'a' 
        });
        stream.write(`${dayjs(Date.now()).format('YYYY-MM-DD HH:mm:ss')} `);
        stream.write(args.join(' ') + '\n');
        loggerStdout(...args);
        stream.end();
    };
}
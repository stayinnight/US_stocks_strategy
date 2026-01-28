// import { JSONFilePreset } from 'lowdb/node';
// import fs from 'fs';
// import { resolve } from 'path';
// import { StrategyConfig } from '../interface/config';

// const DBCollection = {
//     Account: 'account', // 账户状态
//     States: 'states', // 持仓状态
//     Market: 'market', // 市场数据
//     Config: 'config', // 配置数据
// }

// const DATA_ROOT = './data';

// class DB {
//     tables: Record<string, any> = {};

//     constructor() {
//         this.tables = {};
//     }

//     connect() {
//         return Promise.all(Object.values(DBCollection).map(async collection => {
//             const dbPath = resolve(DATA_ROOT, collection + '.json');
//             if (!fs.existsSync(dbPath)) {
//                 fs.mkdirSync(resolve(DATA_ROOT), { recursive: true });
//                 fs.writeFileSync(dbPath, '{}');
//             }
//             const a = await JSONFilePreset<StrategyConfig>(dbPath, {});
//             this.tables[collection] = a;
//         }));
//     }
// }

// export { DBCollection, DB }
export {}
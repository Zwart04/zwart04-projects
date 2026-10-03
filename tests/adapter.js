import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
class Statement {
 constructor(db,sql,args=[]) {this.db=db;this.sql=sql;this.args=args;}
 bind(...args) {return new Statement(this.db,this.sql,args);}
 async first() {return this.db.prepare(this.sql).get(...this.args)||null;}
 async all() {return {results:this.db.prepare(this.sql).all(...this.args)};}
 async run() {const result=this.db.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes)}};}
}
export function database() {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../platform/schema.sql',import.meta.url),'utf8'));
 return {sqlite,prepare(sql){return new Statement(sqlite,sql);},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(/^\s*SELECT/i.test(s.sql)?await s.all():await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
export const testEnv=()=>({DB:database(),PEPPER:'test-only-isolated-secret-never-deployed-000000000000'});

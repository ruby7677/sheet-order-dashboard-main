import {DatabaseSync} from 'node:sqlite';
// Tests execute the production SQL and trigger in a real isolated SQLite database.
// Cloudflare binding/runtime compatibility is checked separately before publishing.
export function createSQLiteTestDatabase(){
 const sqlite=new DatabaseSync(':memory:');
 const prepared=(sql,params=[])=>{const execute=()=>{const s=sqlite.prepare(sql);return s.columns().length?{success:true,results:s.all(...params),meta:{changes:0}}:{success:true,results:[],meta:{changes:Number(s.run(...params).changes)}};};return {bind:(...values)=>prepared(sql,values),first:async()=>sqlite.prepare(sql).get(...params)||null,all:async()=>({success:true,results:sqlite.prepare(sql).all(...params),meta:{changes:0}}),run:async()=>execute(),execute};};
 return {prepare:sql=>prepared(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=statements.map(statement=>statement.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}},close:()=>sqlite.close()};
}

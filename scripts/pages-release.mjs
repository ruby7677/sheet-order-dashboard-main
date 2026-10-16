import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const policies = {
 production: { project: 'sheet-order-dashboard-main', branch: 'main', service: 'sheet-order-api' },
 staging: { project: 'lopokao-dashboard-staging-20261002', branch: 'staging', service: 'sheet-order-api-staging-20261002' },
};
const account = '91137cab6bf37f92cb486965eed90181';
const scriptRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const manifestName='.pages-release.json';
function files(root,relative){
 const target=path.join(root,relative);if(!fs.existsSync(target))throw Error('REQUIRED_PATH_MISSING: '+relative);
 if(fs.lstatSync(target).isSymbolicLink())throw Error('SOURCE_LINK_REJECTED: '+relative);
 if(fs.statSync(target).isFile())return [relative.replaceAll('\\','/')];
 return fs.readdirSync(target).sort().flatMap(name=>files(root,path.join(relative,name)));
}
export function snapshot(root,roots){return Object.fromEntries(roots.flatMap(name=>files(root,name)).sort().map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]));}
const sourceRoots=['src','functions','public','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.app.json','tsconfig.node.json','tsconfig.test.json','vitest.config.ts'];
export function recordBuild(root,mode){
 if(!policies[mode]||process.env.VITE_ENVIRONMENT!==mode)throw Error('BUILD_ENVIRONMENT_MISMATCH');
 if(!fs.existsSync(path.join(root,'functions/api/[[path]].ts')))throw Error('PAGES_FUNCTIONS_MISSING');
 const assets=snapshot(root,['dist']);
 if(!assets['dist/index.html']||!assets['dist/_headers']||!Object.keys(assets).some(p=>p.startsWith('dist/assets/')&&p.endsWith('.js')))throw Error('BUILD_INCOMPLETE');
 const result={mode,source:snapshot(root,sourceRoots),assets};fs.writeFileSync(path.join(root,manifestName),JSON.stringify(result,null,2)+'\n');return result;
}
export function validateBuild(root,mode){
 if(!policies[mode])throw Error('UNKNOWN_ENVIRONMENT');
 if(!fs.existsSync(path.join(root,'functions/api/[[path]].ts')))throw Error('PAGES_FUNCTIONS_MISSING');
 const value=JSON.parse(fs.readFileSync(path.join(root,manifestName),'utf8'));
 if(value.mode!==mode)throw Error('BUILD_ENVIRONMENT_MISMATCH');
 if(JSON.stringify(value.source)!==JSON.stringify(snapshot(root,sourceRoots)))throw Error('SOURCE_CHANGED_AFTER_BUILD');
 if(JSON.stringify(value.assets)!==JSON.stringify(snapshot(root,['dist'])))throw Error('BUILD_CHANGED_AFTER_CHECK');
 return value;
}
export function validateProject(project,mode){const p=policies[mode],binding=project?.deployment_configs?.production?.services?.ADMIN_API;if(!p||project?.name!==p.project||project.production_branch!==p.branch||binding?.service!==p.service||binding?.environment!=='production')throw Error('PAGES_PROJECT_OR_BINDING_MISMATCH');}
export function validateDeployment(project,deployment,mode,oldId){validateProject(project,mode);const canonical=project.canonical_deployment;if(!canonical?.id||canonical.id===oldId||deployment?.id!==canonical.id||deployment.uses_functions!==true||deployment.latest_stage?.status!=='success'||deployment.deployment_trigger?.metadata?.branch!==policies[mode].branch)throw Error('PAGES_DEPLOYMENT_NOT_VERIFIED');return canonical.id;}
function run(root,command,args){const r=spawnSync(command,args,{cwd:root,stdio:'inherit',shell:false,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});if(r.status!==0)throw Error('RELEASE_COMMAND_FAILED');}
function token(){
 if(process.env.CLOUDFLARE_API_TOKEN)return process.env.CLOUDFLARE_API_TOKEN;
 const base=process.env.APPDATA||path.join(os.homedir(),'.config');
 const locations=[path.join(base,'xdg.config/.wrangler/config/default.toml'),path.join(os.homedir(),'.config/.wrangler/config/default.toml')];
 for(const file of locations){if(!fs.existsSync(file))continue;const match=fs.readFileSync(file,'utf8').match(/^oauth_token\s*=\s*("[^\n]+")\s*$/m);if(match)return JSON.parse(match[1]);}
 throw Error('CLOUDFLARE_LOGIN_REQUIRED');
}
async function api(route){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+route,{headers:{Authorization:'Bearer '+token()},redirect:'error',signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok||body.success!==true)throw Error('CLOUDFLARE_READ_FAILED');return body.result;}
export async function main(action,mode,root=scriptRoot){
 if(!policies[mode])throw Error('UNKNOWN_ENVIRONMENT');
 if(action==='build'){
  if(process.env.VITE_ENVIRONMENT!==mode)throw Error('BUILD_ENVIRONMENT_MISMATCH');
  const before=snapshot(root,sourceRoots);
  run(root,process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build']);
  if(JSON.stringify(before)!==JSON.stringify(snapshot(root,sourceRoots)))throw Error('SOURCE_CHANGED_DURING_BUILD');
  recordBuild(root,mode);console.log('Fresh build hashes recorded for '+mode);return;
 }
 validateBuild(root,mode);
 const project=await api('/pages/projects/'+policies[mode].project);validateProject(project,mode);
 if(action==='preflight'){console.log(JSON.stringify({preflight:'passed',mode,project:project.name,functions:true,service:policies[mode].service}));return;}
 if(action!=='deploy')throw Error('UNKNOWN_ACTION');
 const git=spawnSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:root,encoding:'utf8'});
 if(git.status!==0||git.stdout.trim())throw Error('RELEASE_REQUIRES_CLEAN_CHECKOUT');
 const previous=project.canonical_deployment?.id;
 // The cwd is always the project root containing functions/, never sheet-order-api/.
 const wrangler=path.join(root,'sheet-order-api/node_modules/wrangler/bin/wrangler.js');
 if(!fs.existsSync(wrangler))throw Error('WRANGLER_DEPENDENCIES_MISSING');
 run(root,process.execPath,['--use-system-ca',wrangler,'pages','deploy','dist','--project-name',policies[mode].project,'--branch',policies[mode].branch]);
 let checked;
 for(let attempt=0;attempt<6;attempt++){
  const updated=await api('/pages/projects/'+policies[mode].project);
  if(updated.canonical_deployment?.id!==previous){const deployment=await api('/pages/projects/'+policies[mode].project+'/deployments/'+updated.canonical_deployment.id);try{checked=validateDeployment(updated,deployment,mode,previous);break;}catch(error){if(attempt===5)throw error;}}
  if(attempt<5)await new Promise(resolve=>setTimeout(resolve,2000));
 }
 if(!checked)throw Error('PAGES_DEPLOYMENT_NOT_VERIFIED');
 console.log(JSON.stringify({deployment:'verified',id:checked,mode,uses_functions:true,service:policies[mode].service}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv[2],process.argv[3]).catch(error=>{console.error(error.message);process.exitCode=1;});

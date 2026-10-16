import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {recordBuild,validateBuild,validateProject,validateDeployment,policies} from '../pages-release.mjs';

test('rejects missing Functions, stale assets, source edits and wrong build environment',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pages-guard-'));
 const before=process.env.VITE_ENVIRONMENT;
 try{
  for(const file of ['src/main.tsx','functions/api/[[path]].ts','public/_headers','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.app.json','tsconfig.node.json','tsconfig.test.json','vitest.config.ts','dist/index.html','dist/_headers','dist/assets/app.js']){const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'synthetic');}
  process.env.VITE_ENVIRONMENT='production';recordBuild(root,'production');assert.equal(validateBuild(root,'production').mode,'production');
  assert.throws(()=>validateBuild(root,'staging'),/ENVIRONMENT/);
  fs.appendFileSync(path.join(root,'dist/assets/app.js'),'changed');assert.throws(()=>validateBuild(root,'production'),/BUILD_CHANGED/);
  recordBuild(root,'production');fs.appendFileSync(path.join(root,'src/main.tsx'),'changed');assert.throws(()=>validateBuild(root,'production'),/SOURCE_CHANGED/);
  fs.unlinkSync(path.join(root,'functions/api/[[path]].ts'));assert.throws(()=>validateBuild(root,'production'),/FUNCTIONS_MISSING/);
 }finally{if(before===undefined)delete process.env.VITE_ENVIRONMENT;else process.env.VITE_ENVIRONMENT=before;if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'pages-guard-'))throw Error('TEST_TEMP_PATH_GUARD');fs.rmSync(root,{recursive:true,force:true});}
});
test('requires correct environment project and binding, Functions, branch and successful new deployment',()=>{
 const p=policies.production;
 const project={name:p.project,production_branch:p.branch,deployment_configs:{production:{services:{ADMIN_API:{service:p.service,environment:'production'}}}},canonical_deployment:{id:'new'}};
 const deployment={id:'new',uses_functions:true,latest_stage:{status:'success'},deployment_trigger:{metadata:{branch:'main'}}};
 assert.equal(validateDeployment(project,deployment,'production','old'),'new');
 assert.throws(()=>validateProject(project,'staging'),/MISMATCH/);
 assert.throws(()=>validateDeployment(project,{...deployment,uses_functions:false},'production','old'),/NOT_VERIFIED/);
 assert.throws(()=>validateDeployment(project,{...deployment,deployment_trigger:{metadata:{branch:'develop'}}},'production','old'),/NOT_VERIFIED/);
 assert.throws(()=>validateDeployment(project,deployment,'production','new'),/NOT_VERIFIED/);
 const bad=structuredClone(project);bad.deployment_configs.production.services.ADMIN_API.service='wrong';assert.throws(()=>validateProject(bad,'production'),/MISMATCH/);
 const staging=structuredClone(project);staging.name=policies.staging.project;staging.production_branch=policies.staging.branch;staging.deployment_configs.production.services.ADMIN_API.service=policies.staging.service;assert.doesNotThrow(()=>validateProject(staging,'staging'));
});

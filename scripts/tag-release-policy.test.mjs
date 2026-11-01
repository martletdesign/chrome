import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSource,validateProduction} from './tag-release-policy.mjs';

test('all native repository identities match their source, tag and private build manifest',()=>{
  for(const family of ['martlet','krigsvold'])for(const kind of ['vim','emacs','chrome','firefox']){
    const source={family,kind,version:'1.2.3'},pkg={name:`${family}-${kind}-source`,version:'1.2.3',private:true};
    const good={repository:`${family}design/${kind}`,tag:'v1.2.3',source,pkg};assert.equal(validateSource(good).version,'1.2.3');
    for(const bad of [{tag:'v01.2.3'},{repository:'other/repo'},{source:{...source,version:'1.2.4'}},{pkg:{...pkg,private:false}}])assert.throws(()=>validateSource({...good,...bad}));
  }
});
test('protected flag, event SHA, first-parent history and unchanged remote tag are required',()=>{
  const sha='1'.repeat(40),object='2'.repeat(40),tag='v1.2.3';
  const git=a=>a[0]==='ls-remote'?`${object}\trefs/tags/${tag}`:a[0]==='rev-list'?sha:(a.at(-1).endsWith('^{commit}')||a.at(-1)==='HEAD'?sha:object);
  validateProduction({git,tag,sha,protectedRef:'true'});
  assert.throws(()=>validateProduction({git,tag,sha,protectedRef:'false'}));
  assert.throws(()=>validateProduction({git:a=>a[0]==='rev-list'?'3'.repeat(40):git(a),tag,sha,protectedRef:'true'}));
  assert.throws(()=>validateProduction({git:a=>a[0]==='ls-remote'?'':git(a),tag,sha,protectedRef:'true'}));
});
test('tag artifact and release jobs remain disabled and do not submit to stores',async()=>{
  const workflow=await readFile('.github/workflows/native-release.yml','utf8');
  assert.equal((workflow.match(/if:\s*\$\{\{ false \}\}/g)??[]).length,3);
  assert.match(workflow,/uses:\s*\.\/\.github\/workflows\/verify\.yml/);
  assert.match(workflow,/sha256sum --check dist\/SHA256SUMS/);
  assert.match(workflow,/gh release create/);
  assert.match(workflow,/gh release download/);
  assert.match(workflow,/cmp dist\/SHA256SUMS/);
  assert.doesNotMatch(workflow,/npm publish|webstore|addons\.mozilla\.org/);
});


test('Chrome prereleases preserve their display version with a valid numeric manifest version',async()=>{
  const {chromeTheme}=await import('./app-ports.mjs');
  const source=JSON.parse(await readFile('source.json','utf8'));
  const manifest=chromeTheme(source.themes.light,'1.2.3-beta.1');
  assert.equal(manifest.version,'1.2.3');
  assert.equal(manifest.version_name,'1.2.3-beta.1');
  const pkg={name:`${source.family}-chrome-source`,version:'65536.1.0',private:true};
  assert.throws(()=>validateSource({repository:`${source.family}design/chrome`,tag:'v65536.1.0',source:{...source,version:pkg.version},pkg}));
  assert.throws(()=>chromeTheme(source.themes.light,'65536.1.0'));
});

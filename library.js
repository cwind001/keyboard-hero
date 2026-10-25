'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,data){const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw Error(body.error||'请求失败');return body}
let catalog={textbooks:[],lists:[]},editingId=null,validated=null,busy=false;
async function action(fn){if(busy)return;busy=true;$('error').textContent='';$('status').textContent='';try{await fn()}catch(err){$('error').textContent=err.message}finally{busy=false}}
function bookName(id){const b=catalog.textbooks.find(b=>b.id===id);return b?[b.name,b.edition,b.grade,b.volume].filter(Boolean).join(' · '):'独立词表'}
async function refresh(){const previousBook=$('bookEdit').value,previousListBook=$('listBook').value;catalog=await api('catalog');const options=catalog.textbooks.map(b=>`<option value="${b.id}">${esc(bookName(b.id))}</option>`).join('');$('bookEdit').innerHTML='<option value="">新建教材</option>'+options;$('listBook').innerHTML='<option value="">独立词表</option>'+options;$('bookEdit').value=previousBook;$('listBook').value=previousListBook;$('lists').innerHTML=catalog.lists.map(l=>`<div class="record-card"><strong>${esc(bookName(l.textbook_id))} / ${esc(l.name)}</strong><p>${l.word_count} 个单词 · ${esc(l.description)}</p><button data-edit="${l.id}">编辑词表</button> <button data-archive="${l.id}">归档</button></div>`).join('')||'<p>还没有词表，从上面开始创建。</p>'}
$('bookEdit').onchange=()=>{const b=catalog.textbooks.find(b=>String(b.id)===$('bookEdit').value);for(const [id,key] of [['bookName','name'],['edition','edition'],['grade','grade'],['volume','volume']])$(id).value=b?.[key]||'';$('archiveBook').hidden=!b};
$('bookForm').onsubmit=e=>{e.preventDefault();action(async()=>{const b=await api('textbooks',{id:Number($('bookEdit').value)||undefined,name:$('bookName').value,edition:$('edition').value,grade:$('grade').value,volume:$('volume').value});await refresh();$('bookEdit').value=b.id;$('listBook').value=b.id;$('archiveBook').hidden=false;$('status').textContent='教材已保存。';})};
$('archiveBook').onclick=()=>{const id=Number($('bookEdit').value);if(!id||!confirm('归档本教材及其词表？已有历史对局会保留。'))return;action(async()=>{await api(`textbooks/${id}/archive`,{});$('bookEdit').value='';await refresh();$('bookEdit').onchange();newList();$('status').textContent='教材已归档。';})};
function invalidate(){validated=null;$('saveList').disabled=true;$('importPreview').textContent='内容已修改，请重新校验与预览。'}
$('entries').oninput=invalidate;
function parseEntries(text){
 const entries=[],errors=[],seen=new Set();
 text.split(/\r?\n/).forEach((line,index)=>{
  line=line.trim();if(!line)return;
  // Tabs delimit the term and meaning unambiguously; space-separated Chinese meanings are also accepted.
  const tab=line.indexOf('\t');
  const match=tab>=0?[null,line.slice(0,tab),line.slice(tab+1)]:line.match(/^([a-z]+(?:[ -][a-z]+)*)(?:\s+(.*))?$/i);
  if(!match){errors.push(`第 ${index+1} 行：格式无效，仅支持英文字母、单词间空格和连字符`);return;}
  const word=match[1].trim().toLowerCase().replace(/\s+/g,' '),meaning=(match[2]||'').trim();
  if(word.length>40||!(/^[a-z]+(?:[ -][a-z]+)*$/).test(word)){errors.push(`第 ${index+1} 行：英文最长 40 字符，仅支持字母、空格和连字符`);return;}
  if(meaning.length>120){errors.push(`第 ${index+1} 行：中文释义超过 120 字`);return;}
  if(seen.has(word)){errors.push(`第 ${index+1} 行：重复词条 ${word}，请合并或移除`);return;}
  seen.add(word);entries.push({text:word,meaning});
 });
 if(!entries.length)errors.push('请至少录入一个有效词条');
 if(entries.length>3000)errors.push('每张词表最多支持 3000 个词条');
 return {entries,errors};
}
$('preview').onclick=()=>{const result=parseEntries($('entries').value);validated=result.errors.length?null:result.entries;$('saveList').disabled=!validated;const missing=result.entries.filter(e=>!e.meaning).length;$('importPreview').innerHTML=`<p>有效 ${result.entries.length} 词 · 缺少中文 ${missing} 词${missing?'（只能用于完整英文玩法，补齐后可用于中文拼写）':''}</p>`+(result.errors.length?'<p class="error">'+result.errors.map(esc).join('<br>')+'</p>':'')+'<table><tr><th>英文</th><th>中文释义</th></tr>'+result.entries.map(e=>`<tr><td>${esc(e.text)}</td><td>${esc(e.meaning||'待补充')}</td></tr>`).join('')+'</table>'};
$('listForm').onsubmit=e=>{e.preventDefault();if(!validated)return;action(async()=>{const result=await api('lists',{id:editingId||undefined,textbook_id:Number($('listBook').value)||null,name:$('listName').value,description:$('description').value,entries:validated});editingId=result.id;$('editorTitle').textContent='编辑词表';await refresh();$('status').textContent='词表已保存。回到游戏并点击开始，即可刷新选择。';})};
function newList(){editingId=null;validated=null;$('listForm').reset();$('editorTitle').textContent='新建词表';$('importPreview').textContent='';$('saveList').disabled=true}
$('newList').onclick=newList;
$('lists').onclick=e=>{const edit=e.target.dataset.edit,archive=e.target.dataset.archive;if(edit)action(async()=>{const list=await api('lists/'+edit);editingId=list.id;$('listBook').value=list.textbook_id||'';$('listName').value=list.name;$('description').value=list.description;$('entries').value=list.entries.map(e=>e.text+(e.meaning?'\t'+e.meaning:'')).join('\n');$('editorTitle').textContent='编辑词表';invalidate();$('editorTitle').scrollIntoView({behavior:'smooth'});});if(archive&&confirm('归档这张词表？已有历史对局会保留。'))action(async()=>{await api('lists/'+archive+'/archive',{});if(editingId===Number(archive))newList();await refresh();$('status').textContent='词表已归档。';})};
action(refresh);

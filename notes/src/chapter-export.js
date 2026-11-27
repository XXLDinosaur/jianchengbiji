export function installChapterExport({api,checked,toast,settle}) {
  const menu = document.getElementById('fileMenu');
  const button = document.createElement('button');
  button.id = 'chapterWordBtn';
  button.type = 'button';
  button.textContent = '按章节导出 Word…';
  button.setAttribute('role','menuitem');
  menu.insertBefore(button,document.getElementById('helpBtn'));
  const dialog = document.createElement('dialog');
  dialog.id = 'chapterWordDialog';
  dialog.className = 'vault-dialog';
  dialog.innerHTML = '<form method="dialog"><h3>按章节导出 Word</h3><p>按下列顺序合成可编辑的 .docx 文档。</p><ol aria-label="章节顺序"></ol><p role="alert" hidden></p><footer><button type="button" data-add>添加章节</button><span></span><button value="cancel">取消</button><button type="button" data-export class="primary">导出 Word</button></footer></form>';
  document.body.append(dialog);
  let files=[],root=null;
  const rows=dialog.querySelector('ol'), submit=dialog.querySelector('[data-export]');
  const status=dialog.querySelector('[role="alert"]');
  function showError(error){status.textContent=error.message;status.hidden=false;}
  const call=(action,data={})=>checked(api.vault({action,...data}));
  function render(){
    rows.replaceChildren();
    files.forEach((file,index)=>{
      const row=document.createElement('li'),name=document.createElement('span');
      name.textContent=file;
      row.append(name);
      for(const [label,offset] of [['上移',-1],['下移',1],['移除',0]]){
        const move=document.createElement('button');
        move.textContent=label;move.type='button';move.setAttribute('aria-label',label+' '+file);
        const next=index+offset;
        move.disabled=next<0||next>=files.length;
        move.onclick=()=>{files.splice(index,1);if(offset)files.splice(next,0,file);render();};
        row.append(move);
      }
      rows.append(row);
    });
    submit.disabled=!files.length;
  }
  async function pick(){
    const result=await call('word-pick',root?{expectedRoot:root}:{});
    if(!result)return false;
    root=result.root;
    files=[...new Set([...files,...result.files])];
    render();return true;
  }
  button.onclick=async()=>{
    try {
      files=[];root=null;status.hidden=true;
      if(await pick())dialog.showModal();
    }catch(error){toast(error.message);}
  };
  dialog.querySelector('[data-add]').onclick=()=>pick().catch(showError);
  submit.onclick=async()=>{
    submit.disabled=true;status.hidden=true;
    try {
      if(!await settle())return;
      const result=await call('word-export',{expectedRoot:root,files});
      if(!result)return;
      dialog.close();
      toast('已导出 '+result.path+(result.warnings.length?'。'+result.warnings.join('。'):''));
    }catch(error){showError(error);}
    finally{submit.disabled=!files.length;}
  };
}

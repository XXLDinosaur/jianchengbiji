export function installUpdateNotice({api,checked,productName}) {
  const menu = document.getElementById('fileMenu');
  const checkButton = document.createElement('button');
  checkButton.id = 'checkUpdatesBtn';
  checkButton.type = 'button';
  checkButton.setAttribute('role','menuitem');
  checkButton.textContent = '检查更新…';
  menu.insertBefore(checkButton,document.getElementById('helpBtn'));

  const notice = document.createElement('aside');
  notice.id = 'updateNotice';
  notice.hidden = true;
  notice.setAttribute('aria-label','软件更新');
  notice.innerHTML = '<div role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></div>' +
    '<footer><button type="button" data-close></button><button type="button" data-browser hidden>浏览器下载</button>' +
    '<button type="button" data-action class="primary"></button></footer>';
  document.body.append(notice);
  const title = notice.querySelector('strong'), detail = notice.querySelector('p');
  const close = notice.querySelector('[data-close]'), action = notice.querySelector('[data-action]');
  const browser = notice.querySelector('[data-browser]');
  let sequence = 0, manual = false, automaticPending = false;
  function hide() {
    sequence++;
    notice.hidden = true;
    if (manual) document.getElementById('fileMenuBtn').focus();
    manual = false;
  }
  close.onclick = hide;
  notice.addEventListener('keydown',event => {
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
  });
  function show(heading, text, closeLabel, actionLabel, onAction, onBrowser) {
    title.textContent = heading;
    detail.textContent = text;
    close.textContent = closeLabel;
    action.hidden = !actionLabel;
    action.disabled = false;
    action.textContent = actionLabel || '';
    action.onclick = onAction || null;
    browser.hidden = !onBrowser;
    browser.disabled = false;
    browser.onclick = onBrowser || null;
    notice.hidden = false;
  }
  function showError(error) {
    show('检查更新',error.message,'关闭','重新检查',() => check('manual'));
  }
  function offer(result,ticket) {
    const version = result.latest, heading = productName + ' ' + version + ' 可用';
    const run = action => checked(api.openUpdate({version,action}));
    async function openBrowser() {
      action.disabled = browser.disabled = true;
      try { await run('browser'); if (ticket === sequence) hide(); }
      catch (error) { if (ticket === sequence) show('浏览器下载',error.message,'关闭','重试',openBrowser); }
    }
    async function install() {
      show('正在校验安装包','校验通过后将打开 Windows 安装向导。','关闭');
      try {
        await run('install');
        if (ticket === sequence) show('安装向导已打开','请按 Windows 安装向导的提示完成更新。','关闭');
      } catch (error) {
        if (ticket === sequence) show('未能打开安装向导',error.message,'关闭','重新检查',() => check('manual'),openBrowser);
      }
    }
    function ready() {
      show(productName + ' ' + version + ' 已下载','安装包已通过 SHA-256 校验。准备好后可打开安装向导。','稍后安装','打开安装向导',install);
    }
    async function download() {
      show('正在下载安装包','请选择保存位置。下载完成后会校验文件。','隐藏');
      try {
        const download = await run('download');
        if (ticket !== sequence) return;
        if (download.status === 'canceled') { offer(result,ticket); return; }
        ready();
      } catch (error) {
        if (ticket === sequence) show('未能下载安装包',error.message,'关闭','重新下载',download,openBrowser);
      }
    }
    if (result.installMode === 'ready') { ready(); return; }
    const current = '当前版本为 ' + result.current + '。';
    if (result.installMode === 'browser') {
      show(heading,current + '此版本未提供 SHA-256 校验值，可在浏览器中下载官方安装包。','稍后提醒','浏览器下载',openBrowser);
      return;
    }
    const size = Math.max(1,Math.round(result.size / 1024 / 1024));
    show(heading,current + 'Windows x64 安装包约 ' + size + ' MB。','稍后提醒','下载安装包',download,openBrowser);
  }
  async function check(mode) {
    const automatic = mode === 'automatic';
    if (automatic && (automaticPending || !notice.hidden || document.hidden)) return;
    if (automatic) automaticPending = true;
    const ticket = ++sequence;
    manual = !automatic;
    if (manual) {
      show('检查更新','正在查询' + productName + '的公开版本…','关闭');
      close.focus();
    }
    try {
      const result = await checked(api.checkUpdates(mode));
      if (ticket !== sequence || !result) return;
      if (result.status === 'available') {
        offer(result,ticket);
      } else if (manual) {
        const text = result.current === result.latest ? '当前版本 ' + result.current + ' 已是最新公开版本。' :
          '当前版本为 ' + result.current + '，最新公开版本为 ' + result.latest + '。';
        show('暂无可用更新',text,'关闭');
      }
    } catch (error) { if (ticket === sequence && manual) showError(error); }
    finally { if (automatic) automaticPending = false; }
  }
  checkButton.onclick = () => check('manual');
  // Delay the first request until the editor is ready. A minimized window checks when restored.
  const automatic = () => check('automatic');
  setTimeout(() => {
    automatic();
    document.addEventListener('visibilitychange',automatic);
    setInterval(automatic,60 * 60 * 1000);
  },5000);
}

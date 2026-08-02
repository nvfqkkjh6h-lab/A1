// アプリの状態データ（ローカルストレージと同期）
let appData = {
  questions: [],
  folders: ['重要問', '直前チェック'],
  examDate: '',
  logs: [] // 閲覧・学習時間記録
};

let currentImages = []; // 一時保存用画像リスト
let subjectChartInstance = null;
let timeChartInstance = null;

// --- 初期化 ---
window.onload = function() {
  loadData();
  renderFolders();
  renderQuestions();
  updateCountdown();
  initAnalytics();
};

function saveData() {
  localStorage.setItem('mednote_data', JSON.stringify(appData));
}

function loadData() {
  const saved = localStorage.getItem('mednote_data');
  if (saved) {
    appData = JSON.parse(saved);
  }
}

// --- タブ切り替え ---
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`tab-${tabName}`).classList.add('active');
  event.target.classList.add('active');

  if (tabName === 'analytics') renderAnalytics();
  if (tabName === 'review') filterReviewList('all');
}

// --- 画像登録 ＆ OCR擬似処理 ---
function handleImageUpload(e) {
  const files = e.target.files;
  if (!files) return;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentImages.push(event.target.result);
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
}

function renderImagePreviews() {
  const container = document.getElementById('image-preview');
  container.innerHTML = currentImages.map(src => `<img src="${src}" alt="preview">`).join('');
}

// 模擬OCR機能（APIを使わずに模擬テキストを読み込む機能）
function runOCR() {
  if (currentImages.length === 0) {
    alert('画像をアップロードしてください');
    return;
  }
  const sampleOcrTexts = [
    "【問題】35歳の女性。無月経と不妊を主訴に来院した。血液生化学所見：LH 18 mIU/mL, FSH 5 mIU/mL。本疾患の超音波所見として特徴的なものはどれか。",
    "【問題】60歳の男性。突然の胸痛と背部痛を訴えて救急外来を受診した。血圧 180/100 mmHg。造影CTで大動脈内に偽腔を認める。最も考えられる疾患はどれか。"
  ];
  const detectedText = sampleOcrTexts[Math.floor(Math.random() * sampleOcrTexts.length)];
  document.getElementById('q-ocr-text').value = detectedText;
  alert('OCR認識が完了しました（デモテキストを入力しました）');
}

// --- 問題の保存・編集 ---
function handleSaveQuestion(e) {
  e.preventDefault();

  const id = document.getElementById('edit-id').value || Date.now().toString();
  const selectedFolders = Array.from(document.getElementById('q-folders').selectedOptions).map(o => o.value);
  const tags = document.getElementById('q-tags').value.split(',').map(t => t.trim()).filter(t => t);

  const existing = appData.questions.find(q => q.id === id);

  const questionObj = {
    id: id,
    title: document.getElementById('q-title').value,
    images: currentImages,
    ocrText: document.getElementById('q-ocr-text').value,
    memo: document.getElementById('q-memo').value,
    subject: document.getElementById('q-subject').value || '未分類',
    field: document.getElementById('q-field').value || '未分類',
    disease: document.getElementById('q-disease').value || '未特定',
    tags: tags,
    label: document.getElementById('q-label').value,
    folders: selectedFolders,
    
    // 学習履歴・エビングハウス忘却曲線用
    reviewsCount: existing ? existing.reviewsCount : 0,
    correctCount: existing ? existing.correctCount : 0,
    incorrectCount: existing ? existing.incorrectCount : 0,
    lastSolvedDate: existing ? existing.lastSolvedDate : null,
    nextReviewDate: existing ? existing.nextReviewDate : new Date().toISOString().split('T')[0],
    bedtimeList: existing ? existing.bedtimeList : false,
    examList: existing ? existing.examList : false,
    lastViewed: new Date().toISOString()
  };

  if (existing) {
    const idx = appData.questions.findIndex(q => q.id === id);
    appData.questions[idx] = questionObj;
  } else {
    appData.questions.push(questionObj);
  }

  saveData();
  alert('問題を保存しました');
  resetForm();
  switchTab('questions');
  renderQuestions();
}

function resetForm() {
  document.getElementById('question-form').reset();
  document.getElementById('edit-id').value = '';
  currentImages = [];
  renderImagePreviews();
}

// --- レンダリング・検索機能 ---
function renderQuestions(listToRender = appData.questions) {
  const container = document.getElementById('questions-list');
  const search = document.getElementById('search-input')?.value.toLowerCase() || '';
  const subject = document.getElementById('filter-subject')?.value || '';
  const folder = document.getElementById('filter-folder')?.value || '';
  const label = document.getElementById('filter-label')?.value || '';

  const filtered = listToRender.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(search) || 
                          q.ocrText.toLowerCase().includes(search) || 
                          q.disease.toLowerCase().includes(search);
    const matchesSubject = !subject || q.subject === subject;
    const matchesFolder = !folder || q.folders.includes(folder);
    const matchesLabel = !label || q.label === label;

    return matchesSearch && matchesSubject && matchesFolder && matchesLabel;
  });

  container.innerHTML = filtered.map(q => `
    <div class="card">
      <div>
        ${q.label ? `<span class="badge ${q.label}">${q.label}</span>` : ''}
        <h3>${q.title}</h3>
        <p><strong>${q.subject}</strong> / ${q.field} (${q.disease})</p>
        <p class="text-sub">${q.ocrText.substring(0, 40)}...</p>
        <div class="card-tags">
          ${q.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
        </div>
      </div>
      <div>
        <hr style="margin: 10px 0;">
        <small>次回復習日: ${q.nextReviewDate || '未設定'}</small><br>
        <button class="btn primary" onclick="openReviewModal('${q.id}')">解く・復習</button>
        <button class="btn secondary" onclick="editQuestion('${q.id}')">編集</button>
        <button class="btn danger" onclick="deleteQuestion('${q.id}')">削除</button>
      </div>
    </div>
  `).join('');
}

function editQuestion(id) {
  const q = appData.questions.find(item => item.id === id);
  if (!q) return;

  switchTab('add');
  document.getElementById('edit-id').value = q.id;
  document.getElementById('q-title').value = q.title;
  document.getElementById('q-ocr-text').value = q.ocrText;
  document.getElementById('q-memo').value = q.memo;
  document.getElementById('q-subject').value = q.subject;
  document.getElementById('q-field').value = q.field;
  document.getElementById('q-disease').value = q.disease;
  document.getElementById('q-tags').value = q.tags.join(', ');
  document.getElementById('q-label').value = q.label;
  
  currentImages = q.images || [];
  renderImagePreviews();
}

function deleteQuestion(id) {
  if (confirm('本当に削除しますか？')) {
    appData.questions = appData.questions.filter(q => q.id !== id);
    saveData();
    renderQuestions();
  }
}

// --- 復習アルゴリズム (エビングハウス忘却曲線) ---
function recordResult(qId, isCorrect, timeSpentMinutes) {
  const q = appData.questions.find(item => item.id === qId);
  if (!q) return;

  const today = new Date();
  q.reviewsCount += 1;
  q.lastSolvedDate = today.toISOString().split('T')[0];

  if (isCorrect) {
    q.correctCount += 1;
  } else {
    q.incorrectCount += 1;
  }

  // 忘却曲線に基づく次回復習日の自動計算 (1日後 -> 3日後 -> 7日後 -> 14日後)
  let daysToAdd = 1;
  if (isCorrect) {
    if (q.reviewsCount === 1) daysToAdd = 1;      // 1回目
    else if (q.reviewsCount === 2) daysToAdd = 3; // 2回目
    else if (q.reviewsCount === 3) daysToAdd = 7; // 3回目
    else daysToAdd = 14;                         // 4回目以降
  } else {
    daysToAdd = 1; // 間違えたら翌日再復習
  }

  const nextDate = new Date();
  nextDate.setDate(today.getDate() + daysToAdd);
  q.nextReviewDate = nextDate.toISOString().split('T')[0];

  // 学習時間の記録
  appData.logs.push({
    date: today.toISOString().split('T')[0],
    minutes: parseInt(timeSpentMinutes) || 2,
    subject: q.subject
  });

  saveData();
  closeModal();
  renderQuestions();
  alert(`記録しました。次回の復習日は ${q.nextReviewDate} です。`);
}

// --- 復習リストの絞り込み ---
function filterReviewList(type) {
  const today = new Date().toISOString().split('T')[0];
  let list = appData.questions;

  if (type === 'due') {
    list = list.filter(q => q.nextReviewDate && q.nextReviewDate <= today);
  } else if (type === 'incorrect') {
    list = list.filter(q => q.incorrectCount > 0);
  } else if (type === 'bedtime') {
    list = list.filter(q => q.bedtimeList);
  } else if (type === 'exam') {
    list = list.filter(q => q.examList);
  } else if (type === 'unseen') {
    // 7日以上見ていない問題
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    list = list.filter(q => !q.lastViewed || q.lastViewed < sevenDaysAgo);
  }

  const container = document.getElementById('review-list');
  container.innerHTML = list.length ? '' : '<p>該当する問題はありません。</p>';
  renderQuestions(list);
}

// --- モーダル (学習＆解説画面) ---
function openReviewModal(id) {
  const q = appData.questions.find(item => item.id === id);
  if (!q) return;

  q.lastViewed = new Date().toISOString();
  saveData();

  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h2>${q.title}</h2>
    <p><strong>${q.subject} / ${q.field}</strong></p>
    
    <div style="margin: 15px 0;">
      ${q.images.map(img => `<img src="${img}" style="max-width:100%; margin-bottom:10px;">`).join('')}
    </div>

    <div style="background:#f0f4f8; padding:15px; border-radius:5px; margin-bottom:15px;">
      <p style="white-space: pre-wrap;">${q.ocrText}</p>
    </div>

    <button class="btn secondary" onclick="document.getElementById('memo-box').style.display='block'">解答・メモを表示</button>

    <div id="memo-box" style="display:none; margin-top:15px; padding:15px; background:#e6fffa;">
      <h4>解説・メモ</h4>
      <p style="white-space: pre-wrap;">${q.memo}</p>
    </div>

    <hr style="margin: 20px 0;">

    <h3>学習結果を記録</h3>
    <div class="form-group">
      <label>かかった時間（分）</label>
      <input type="number" id="time-spent" value="2" min="1">
    </div>

    <div style="display:flex; gap:10px;">
      <button class="btn success" style="flex:1" onclick="recordResult('${q.id}', true, document.getElementById('time-spent').value)">正解 ⭕</button>
      <button class="btn danger" style="flex:1" onclick="recordResult('${q.id}', false, document.getElementById('time-spent').value)">不正解 ❌</button>
    </div>

    <div style="margin-top: 15px;">
      <label><input type="checkbox" ${q.bedtimeList ? 'checked' : ''} onchange="toggleList('${q.id}', 'bedtimeList', this.checked)"> 「寝る前に復習」に追加</label><br>
      <label><input type="checkbox" ${q.examList ? 'checked' : ''} onchange="toggleList('${q.id}', 'examList', this.checked)"> 「試験直前に復習」に追加</label>
    </div>
  `;

  modal.style.display = 'block';
}

function toggleList(id, listType, isChecked) {
  const q = appData.questions.find(item => item.id === id);
  if (q) {
    q[listType] = isChecked;
    saveData();
  }
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// --- フォルダ & 設定 ---
function renderFolders() {
  const select = document.getElementById('q-folders');
  const filterSelect = document.getElementById('filter-folder');
  const list = document.getElementById('folder-list');

  if (select) {
    select.innerHTML = appData.folders.map(f => `<option value="${f}">${f}</option>`).join('');
  }
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">すべてのフォルダ</option>` + appData.folders.map(f => `<option value="${f}">${f}</option>`).join('');
  }
  if (list) {
    list.innerHTML = appData.folders.map(f => `<li>${f}</li>`).join('');
  }
}

function addFolder() {
  const name = document.getElementById('new-folder-name').value.trim();
  if (name && !appData.folders.includes(name)) {
    appData.folders.push(name);
    saveData();
    renderFolders();
    document.getElementById('new-folder-name').value = '';
  }
}

function setExamDate(dateStr) {
  appData.examDate = dateStr;
  saveData();
  updateCountdown();
}

function updateCountdown() {
  if (!appData.examDate) return;
  const exam = new Date(appData.examDate);
  const today = new Date();
  const diffTime = exam - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const el = document.getElementById('days-left');
  if (el) el.innerText = diffDays > 0 ? diffDays : 0;
}

// --- 通知機能模擬 ---
function triggerNotification(title, body) {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification(title, { body: body });
      } else {
        alert(`【${title}】\n${body}`);
      }
    });
  } else {
    alert(`【${title}】\n${body}`);
  }
}

// --- 分析 & グラフ表示 (Chart.js) ---
function initAnalytics() {
  const ctx1 = document.getElementById('subjectChart').getContext('2d');
  const ctx2 = document.getElementById('timeChart').getContext('2d');

  subjectChartInstance = new Chart(ctx1, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: '正答率 (%)', data: [], backgroundColor: '#4299e1' }] },
    options: { scales: { y: { beginAtZero: true, max: 100 } } }
  });

  timeChartInstance = new Chart(ctx2, {
    type: 'line',
    data: { labels: [], datasets: [{ label: '学習時間 (分)', data: [], borderColor: '#38a169', fill: false }] },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

function renderAnalytics() {
  // 1. 科目別正答率の計算
  const subjects = [...new Set(appData.questions.map(q => q.subject))];
  const accuracyData = [];
  let lowestAccuracy = 101;
  let weakSubject = '';

  subjects.forEach(sub => {
    const qList = appData.questions.filter(q => q.subject === sub);
    const totalCorrect = qList.reduce((acc, q) => acc + q.correctCount, 0);
    const totalReviews = qList.reduce((acc, q) => acc + q.reviewsCount, 0);
    
    const rate = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
    accuracyData.push(rate);

    if (totalReviews > 0 && rate < lowestAccuracy) {
      lowestAccuracy = rate;
      weakSubject = sub;
    }
  });

  // 苦手分野の自動抽出表示
  const alertBox = document.getElementById('weakness-alert');
  if (weakSubject) {
    alertBox.style.display = 'block';
    alertBox.innerHTML = `⚠️ <strong>苦手分野の検出:</strong> 「${weakSubject}」の正答率が最も低くなっています (${lowestAccuracy}%)。集中復習をお勧めします！`;
  } else {
    alertBox.style.display = 'none';
  }

  // グラフデータ更新
  subjectChartInstance.data.labels = subjects;
  subjectChartInstance.data.datasets[0].data = accuracyData;
  subjectChartInstance.update();

  // 2. 学習時間の推移 (ログの集計)
  const timeLogs = {};
  appData.logs.forEach(log => {
    timeLogs[log.date] = (timeLogs[log.date] || 0) + log.minutes;
  });

  timeChartInstance.data.labels = Object.keys(timeLogs);
  timeChartInstance.data.datasets[0].data = Object.values(timeLogs);
  timeChartInstance.update();
}

const fs = require('fs');

// 기존 channels.json 읽기
const existingData = JSON.parse(fs.readFileSync('./data/channels.json', 'utf8'));

// URL에서 가져온 새 데이터 (있다면)
const newDataPath = './data/channels-from-urls.json';
if (fs.existsSync(newDataPath)) {
  const newData = JSON.parse(fs.readFileSync(newDataPath, 'utf8'));
  
  // ID를 키로 하는 맵 생성
  const newChannelMap = {};
  newData.channels.forEach(ch => {
    newChannelMap[ch.id] = ch;
  });
  
  // 기존 데이터 업데이트
  existingData.channels.forEach(channel => {
    if (newChannelMap[channel.id]) {
      // 새 데이터로 업데이트
      channel.title = newChannelMap[channel.id].title;
      channel.thumbnail = newChannelMap[channel.id].thumbnail;
      channel.handle = newChannelMap[channel.id].handle;
    }
  });
  
  console.log('✅ 24개 채널 정보 병합 완료');
} else {
  console.log('⚠️ channels-from-urls.json 파일 없음');
}

// 저장
existingData.timestamp = new Date().toISOString();
fs.writeFileSync('./data/channels.json', JSON.stringify(existingData, null, 2));
console.log('💾 channels.json 업데이트 완료');
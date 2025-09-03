const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'channels.json');
let content = fs.readFileSync(filePath, 'utf8');

// Git 충돌 마커 제거
content = content.replace(/<<<<<<< HEAD[\s\S]*?=======/gm, '');
content = content.replace(/>>>>>>> [a-f0-9]+/gm, '');
content = content.replace(/^HEAD$/gm, '');

// 중복된 lastUpdated 제거 (첫 번째만 유지)
content = content.replace(/,\s*"lastUpdated":\s*"[^"]+"/g, (match, offset) => {
    return offset < 100 ? match : '';
});

// JSON 정리
try {
    const data = JSON.parse(content);
    
    // 중복 채널 제거
    const uniqueChannels = [];
    const seenIds = new Set();
    
    for (const channel of data.channels) {
        if (!seenIds.has(channel.id)) {
            seenIds.add(channel.id);
            uniqueChannels.push(channel);
        }
    }
    
    data.channels = uniqueChannels;
    data.totalChannels = uniqueChannels.length;
    
    // 저장
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('✅ JSON 파일 정리 완료!');
    console.log(`📊 ${uniqueChannels.length}개 채널 (중복 제거됨)`);
    
} catch(e) {
    console.log('❌ 자동 정리 실패. 수동으로 수정 필요');
    console.log('메모장에서 다음 줄들을 찾아 삭제:');
    console.log('- <<<<<<< HEAD');
    console.log('- =======');
    console.log('- >>>>>>>');
}
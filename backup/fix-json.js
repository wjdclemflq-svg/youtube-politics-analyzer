 const fs = require('fs');
const path = require('path');

try {
    const filePath = path.join(__dirname, '..', 'data', 'channels.json');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 충돌 마커 제거
    const cleaned = content
        .replace(/<<<<<<< HEAD[\s\S]*?=======/g, '')
        .replace(/>>>>>>> [a-f0-9]+/g, '')
        .replace(/=======/g, '');
    
    // JSON 파싱 시도
    const data = JSON.parse(cleaned);
    
    // 정리된 파일 저장
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    console.log('✅ JSON 파일 정리 완료!');
    console.log(`📊 총 채널: ${data.totalChannels}개`);
    
} catch(e) {
    console.log('❌ 오류:', e.message);
    console.log('수동으로 data/channels.json 파일을 열어서');
    console.log('======= 와 >>>>>>> 줄들을 삭제하세요');
}

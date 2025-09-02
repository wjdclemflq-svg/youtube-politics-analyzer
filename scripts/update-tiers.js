const fs = require('fs');
const path = require('path');

class TierUpdater {
  async update() {
    console.log('📊 채널 계층 자동 업데이트...');
    
    const dataPath = path.join(__dirname, '..', 'data', 'integrated-latest.json');
    const configPath = path.join(__dirname, '..', 'config', 'channels-tiered.json');
    
    if (!fs.existsSync(dataPath)) {
      console.error('데이터 없음');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 성과 기준 정렬
    const ranked = data.channels
      .map(ch => ({
        id: ch.id,
        score: (ch.viewCount || 0) * 0.5 + 
               (ch.viewCountDiff || 0) * 2 + 
               (ch.subscriberCount || 0) * 0.3
      }))
      .sort((a, b) => b.score - a.score);
    
    // 새로운 계층 할당
    const newTiers = {
      tier1: ranked.slice(0, 20).map(ch => ch.id),
      tier2: ranked.slice(20, 50).map(ch => ch.id),
      tier3: ranked.slice(50).map(ch => ch.id),
      metadata: {
        ...config.metadata,
        lastUpdated: new Date().toISOString().split('T')[0],
        autoUpdated: true
      }
    };
    
    // 변경사항 확인
    const changes = {
      promoted: [],
      demoted: []
    };
    
    newTiers.tier1.forEach(id => {
      if (!config.tier1.includes(id)) {
        changes.promoted.push(id);
      }
    });
    
    config.tier1.forEach(id => {
      if (!newTiers.tier1.includes(id)) {
        changes.demoted.push(id);
      }
    });
    
    console.log(`\n📈 승급: ${changes.promoted.length}개 채널`);
    console.log(`📉 강등: ${changes.demoted.length}개 채널`);
    
    // 저장
    fs.writeFileSync(configPath, JSON.stringify(newTiers, null, 2));
    console.log('\n✅ 계층 업데이트 완료');
  }
}

if (require.main === module) {
  new TierUpdater().update();
}

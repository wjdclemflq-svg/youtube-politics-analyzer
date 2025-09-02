const fs = require('fs');
const path = require('path');

class QuotaChecker {
  check() {
    const summaryPath = path.join(__dirname, '..', 'data', 'collection-summary.json');
    
    if (!fs.existsSync(summaryPath)) {
      console.log('요약 데이터 없음');
      return;
    }
    
    const summaries = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const today = summaries.filter(s => s.date === new Date().toISOString().split('T')[0]);
    
    console.log('\n📊 API 할당량 현황');
    console.log('='.repeat(50));
    
    let totalUsed = 0;
    const quotaByKey = { key1: 0, key2: 0, key3: 0 };
    
    today.forEach(s => {
      console.log(`\n⏰ ${s.hour}시 (${s.type})`);
      s.quotaStatus?.forEach(q => {
        console.log(`  ${q.key}: ${q.used}/10000 (${q.percentage}%)`);
        quotaByKey[`key${q.key.slice(-1)}`] += q.used;
      });
      totalUsed += s.stats.apiUsage;
    });
    
    console.log('\n📈 일일 누적');
    console.log(`  총 사용: ${totalUsed}/30000 (${(totalUsed/300).toFixed(1)}%)`);
    Object.entries(quotaByKey).forEach(([key, used]) => {
      console.log(`  ${key}: ${used}/10000 (${(used/100).toFixed(1)}%)`);
    });
    
    console.log('\n💡 권장사항');
    if (totalUsed > 25000) {
      console.log('  ⚠️ 할당량 80% 초과 - 수집 빈도 조정 필요');
    } else if (totalUsed < 5000) {
      console.log('  ✅ 할당량 여유 - 추가 채널 수집 가능');
    } else {
      console.log('  ✅ 할당량 적정 수준');
    }
  }
}

if (require.main === module) {
  new QuotaChecker().check();
}

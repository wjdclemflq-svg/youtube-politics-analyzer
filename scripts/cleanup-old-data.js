const fs = require('fs');
const path = require('path');

class DataCleaner {
  cleanup() {
    console.log('🧹 오래된 데이터 정리 시작...');
    
    const dataDir = path.join(__dirname, '..', 'data');
    const files = fs.readdirSync(dataDir);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    let deletedCount = 0;
    let freedSpace = 0;
    
    files.forEach(file => {
      if (file.includes('integrated') || file.includes('latest')) return;
      
      const filePath = path.join(dataDir, file);
      const stats = fs.statSync(filePath);
      const fileDate = new Date(stats.mtime);
      
      if (fileDate < sevenDaysAgo) {
        freedSpace += stats.size;
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`  삭제: ${file}`);
      }
    });
    
    console.log(`\n✅ 정리 완료`);
    console.log(`  삭제 파일: ${deletedCount}개`);
    console.log(`  확보 공간: ${(freedSpace / 1024 / 1024).toFixed(2)}MB`);
  }
}

if (require.main === module) {
  new DataCleaner().cleanup();
}

# 📊 대규모 정치 유튜브 분석 대시보드

완전 무료로 운영되는 정치 유튜브 채널 분석 시스템입니다.

## 🚀 빠른 시작 (10분 설정)

### 1단계: GitHub 레포지토리 생성

1. GitHub 로그인
2. **New repository** 클릭
3. Repository name: `youtube-politics-analyzer`
4. Public 선택
5. **Create repository**

### 2단계: 파일 업로드

```bash
# 로컬에서 클론
git clone https://github.com/YOUR_USERNAME/youtube-politics-analyzer.git
cd youtube-politics-analyzer

# 파일 구조 생성
mkdir -p .github/workflows scripts config data
```

모든 파일을 해당 폴더에 복사 후:

```bash
git add .
git commit -m "Initial setup"
git push origin main
```

### 3단계: YouTube API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성
3. YouTube Data API v3 활성화
4. 사용자 인증 정보 → API 키 생성
5. 3개 계정으로 반복 (일일 30,000 유닛 확보)

### 4단계: GitHub Secrets 설정

Repository → Settings → Secrets and variables → Actions → New repository secret

```
YOUTUBE_API_KEY1: AIza...첫번째키
YOUTUBE_API_KEY2: AIza...두번째키
YOUTUBE_API_KEY3: AIza...세번째키
```

### 5단계: GitHub Pages 활성화

Settings → Pages → Source: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)`

## 📅 자동 실행 일정

- **오전 6시**: 가벼운 수집 (RSS + 상위 채널)
- **오후 10시**: 전체 상세 수집

수동 실행: Actions → YouTube Data Collection → Run workflow

## 📊 대시보드 접속

```
https://YOUR_USERNAME.github.io/youtube-politics-analyzer/
```

## 📁 프로젝트 구조

```
youtube-politics-analyzer/
├── index.html              # 메인 대시보드
├── package.json           # 의존성 관리
├── README.md             # 이 파일
├── .github/
│   └── workflows/
│       └── collector.yml  # 자동 수집 설정
├── scripts/
│   ├── collect.js        # 데이터 수집
│   └── merge.js         # 데이터 병합
├── config/
│   └── channels.json    # 채널 목록
└── data/
    ├── integrated-latest.json  # 통합 데이터
    ├── dashboard-data.json     # 대시보드용
    └── summary.json           # 일일 요약
```

## 🔧 채널 추가/삭제

`config/channels.json` 파일 수정:

```json
[
  "UCh_채널ID1",
  "UCh_채널ID2",
  // 새 채널 추가
]
```

## 📈 데이터 수집 현황

### 일일 수집 능력
- **채널**: 200개까지
- **동영상**: 8,000개 이상
- **API 사용량**: 일일 한도의 2-3%
- **비용**: 완전 무료

### 수집 데이터
- 채널 통계 (구독자, 조회수, 동영상 수)
- 최신 동영상 (제목, 조회수, 업로드 시간)
- 급상승 동영상 분석
- 평균 대비 우수 동영상

## 🛠️ 문제 해결

### 데이터가 수집되지 않을 때

1. Actions 탭에서 오류 확인
2. API 키가 올바르게 설정되었는지 확인
3. API 할당량 초과 여부 확인

### 대시보드가 표시되지 않을 때

1. GitHub Pages가 활성화되었는지 확인
2. 브라우저 캐시 삭제 (Ctrl+F5)
3. Console 오류 확인 (F12)

## 📊 데이터 분석 기능

### 메인 대시보드
- 실시간 채널 순위
- 일일 조회수 변화
- 급상승 동영상 TOP 30
- 평균 대비 우수 영상

### 상세 모달
- 채널별 상세 정보
- 일별 조회수 차트
- 구독자 증가 추이
- 동영상 업로드 패턴

## 💾 데이터 백업

자동으로 GitHub 레포지토리에 저장되므로 별도 백업 불필요

### 수동 백업
```bash
git pull
cd data/
# 모든 JSON 파일이 여기 저장됨
```

## 🔒 보안

- API 키는 GitHub Secrets에 안전하게 저장
- 공개 레포지토리에서도 API 키 노출 없음
- 데이터는 공개되므로 민감정보 수집 금지

## 📝 라이선스

MIT License - 자유롭게 사용 가능

## 🤝 기여하기

1. Fork 레포지토리
2. 기능 추가/버그 수정
3. Pull Request 제출

## 📞 지원

Issues 탭에서 문제 제보 또는 기능 요청

---

**Made with ❤️ for Korean Politics YouTube Analysis**

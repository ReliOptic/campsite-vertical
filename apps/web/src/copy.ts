// Every user-facing string lives here. tests/copy.test.ts rejects infrastructure vocabulary.
export const copy = {
  brand: 'Campsite',
  tagline: '같은 정보, 더 밝은 내일.',
  landing: { lead: '내 관심사가 매일 한 편의 Vista로 도착합니다.', google: 'Google로 계속하기', devTitle: '체험 계정으로 들어가기', devHint: '같은 계정으로 다시 들어오면 그대로 이어집니다.' },
  mode: { forMe: 'For Me', discovery: 'Discovery' },
  model: {
    title: '어떤 모델로 만들까요',
    help: '내 모델 연결 하나로 Vista가 만들어집니다. 열쇠는 안전하게 보관되고 다시 보이지 않아요.',
    keyLabel: '연결 열쇠', keyPlaceholder: 'sk-or-…', modelLabel: '모델', connect: '연결하기', later: '나중에', connected: '연결됨', change: '바꾸기', disconnect: '연결 해제',
    invalid: '열쇠를 확인하지 못했어요. 다시 붙여 넣어 주세요.',
  },
  prompt: {
    title: '어떤 Vista를 만들까요', help: '만들고 싶은 내용과 참고할 정보를 자유롭게 적어 주세요. 이번 Vista를 만드는 데만 사용해요.',
    placeholder: '예: AI 데이터센터의 전력 병목을 추적하고, 큰 변화가 생기면 원인과 영향을 보여 주세요.',
    cancel: '취소', create: '만들기', scheduleLabel: '계속 받아보기', scheduleOff: '한 번만', scheduleDaily: '매일', scheduleHourly: '매시간', scheduleSix: '6시간마다',
  },
  status: { QUEUED: '준비하고 있어요', SEARCHING: '자료를 찾고 있어요', DRAFTING: 'Vista를 만들고 있어요', VERIFYING: '마무리하고 있어요', DONE: 'Vista가 도착했어요', SKIPPED: '새로운 변화가 없어 이번엔 쉬었어요', FAILED: '만들지 못했어요.', retry: '다시 시도', cancel: '취소 요청 중', receipt: '접수 확인 중' },
  errors: {
    UNAUTHENTICATED: '다시 들어와 주세요.', CHANNEL_LIMIT: '지금은 채널을 {max}개까지 만들 수 있어요.', RUN_LIMIT: '오늘 만들 수 있는 Vista를 모두 썼어요. 내일 다시 만들 수 있어요.',
    NOT_FOUND: '찾을 수 없는 항목이에요.', INVALID_REQUEST: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.', RUN_FAILED: '만들지 못했어요.', MODEL_NOT_CONNECTED: '먼저 모델을 연결해 주세요.', INVALID_KEY: '열쇠를 확인하지 못했어요.', INTERNAL: '잠시 문제가 생겼어요. 다시 시도해 주세요.', NETWORK: '연결이 불안정해요.',
  },
  forMe: { empty: '첫 채널을 만들어 보세요.', newChannel: '새 채널', profile: '프로필', ask: '이 Vista에 대해 묻기', deepDive: '더 깊이 보기', publish: '발행하기', published: '발행됨', unpublish: '발행 취소', play: '재생', pause: '일시정지', restart: '처음부터', scenes: '장면', captions: '자막', sources: '출처', subscriptions: '구독' },
  discovery: { empty: '아직 발행된 Vista가 없어요. 내 Vista를 발행해 보세요.', subscribe: '구독', subscribed: '구독 중', fork: '내 것으로 가져오기', forked: '가져왔어요', by: '{name}의 채널', forks: '{n}명이 가져감', more: '더보기', unsubscribe: '구독 해제' },
  ask: { title: '이 Vista에 대해 묻기', placeholder: '궁금한 점을 짧게 적어 주세요', listening: '듣고 있어요…', send: '묻기', mic: '말로 묻기', typed: '글로 묻기', thinking: '답을 찾고 있어요' },
  deepDive: { title: '어디서 더 깊이 볼까요', chatgpt: 'ChatGPT에서 열기', claude: 'Claude에서 열기', copy: '내용 복사' },
  profile: { logout: '로그아웃', plan: '요금제', channels: '채널 {used}/{max}', today: '오늘 {used}/{max}', nextUpdate: '다음 업데이트', none: '예정 없음', model: '모델' },
  duo: { open: '펼치기', close: '접기', controls: '조작', continuing: '바깥에서 보던 장면을 이어서 보여 드려요.' },
  device: { iphone: 'iPhone 17', duoClosed: 'Duo 닫힘', duoOpen: 'Duo 펼침', none: '전체 화면' },
  common: { close: '닫기', back: '뒤로', loading: '불러오는 중', done: '완료' },
} as const;

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
}
export function phaseCopy(phase: string): string { return (copy.status as Record<string, string>)[phase] ?? copy.status.QUEUED; }
export function errorCopy(code: string, vars: Record<string, string | number> = {}): string { return fill((copy.errors as Record<string, string>)[code] ?? copy.errors.INTERNAL, vars); }

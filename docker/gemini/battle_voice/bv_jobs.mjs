// 전투 음성 TTS 작업 정의. 원칙: 단어·언어 없이 '발성'만(언어권 무관), 실존 인물·작품 언급 없음.
// 한 호출에 여러 발성을 긴 쉼으로 구분해 받고 bv_pp.mjs 가 무음 기준으로 잘라 개별 클립으로 쓴다.
const PRE = 'Audio performance for a video game sound effect. Perform ONLY wordless vocal sounds exactly as written, no speech, no narration, do not read any instructions aloud. Leave about one full second of silence between each sound.';
const SHOUT = (who) => `${PRE} ${who}, loud and full-chested battle cries at the moment of charging into battle, raw and fierce, each about one second: "Waaaah!" ... "Haaaa!" ... "Uoooh!" ... "Raaagh!" ... "Hyaaa!"`;
const DIE = (who) => `${PRE} ${who}, short painful cries of a soldier being struck down in battle, sudden and sharp, each under one second: "Agh!" ... "Ugh!" ... "Gaaah!" ... "Hngh!" ... "Aaugh..." ... "Kh!"`;
const HERO = (who) => `${PRE} ${who}, one long, tragic, heroic final cry of a commander falling in battle, starting strong then fading into a dying breath, about two seconds: "Aaaaaahhh..." ... then one more different version: "Uuoooohh...!"`;
const CHEER = (who) => `${PRE} ${who}, joyful triumphant victory cheers of a soldier after winning a battle, each about one second: "Yeaaah!" ... "Oooh-ah!" ... "Waaa-hoo!"`;

const SNAP = (who) => `Scream sharply like ${who} suddenly struck down in battle. Each scream is short, explosive and abruptly cut off, no moaning, with a pause between: "AAGH!" ... "UWAAH!" ... "GAH!" ... "AARGH!" ... "HYAAGH!" ... "KHAAH!"`;
export const JOBS = {
  // 함성(컷씬 시작). 남성 6목소리 -> 레이어링으로 소규모/보병/대군 변형 제작
  s1: { cat: 'shout', voice: 'Fenrir', text: SHOUT('A young male soldier with a rough voice') },
  s2: { cat: 'shout', voice: 'Charon', text: SHOUT('A deep-voiced veteran male warrior') },
  s3: { cat: 'shout', voice: 'Orus', text: SHOUT('A strong adult male soldier') },
  s4: { cat: 'shout', voice: 'Algenib', text: SHOUT('A gravelly male soldier') },
  s5: { cat: 'shout', voice: 'Alnilam', text: SHOUT('A burly male spearman') },
  s6: { cat: 'shout', voice: 'Puck', text: SHOUT('An energetic young male recruit') },
  // 피격·사망 비명(개체 쓰러짐)
  d1: { cat: 'die', voice: 'Fenrir', text: DIE('A young male soldier') },
  d2: { cat: 'die', voice: 'Charon', text: DIE('A deep-voiced male soldier') },
  d3: { cat: 'die', voice: 'Algenib', text: DIE('A gravelly male soldier') },
  d4: { cat: 'die', voice: 'Orus', text: DIE('An adult male soldier') },
  // 영웅·지휘관 사망 외침(길고 비장)
  h1: { cat: 'hero', voice: 'Charon', text: HERO('A deep, noble male commander') },
  h2: { cat: 'hero', voice: 'Orus', text: HERO('A proud male general') },
  hf: { cat: 'hero', voice: 'Gacrux', text: HERO('A brave female commander') },
  // hf 2회 무음 응답(200, 오디오 없음) -> 완화 문구 + 신모델 1회 시도용
  hf2: { cat: 'hero', voice: 'Gacrux', text: `${PRE} A brave female knight, exhausted after a long battle, gives one long, strong, heroic cry that slowly fades into a weary sigh, about two seconds: "Haaaaaahh..." ... then one more different version: "Aaaaahh...!"` },
  hf3: { cat: 'hero', voice: 'Gacrux', text: 'Cry out in a loud, anguished, heroic voice that fades away: "Haaaaaaaahh... aaahh..."' },
  // h1/h2 블라인드 QA: 신음·한숨으로 약함 -> 짧은 지시형(pro 모델)으로 강한 외침 재시도
  h3: { cat: 'hero', voice: 'Charon', text: 'Scream out a loud, agonized, heroic final battle cry that breaks and fades away: "AAAAAAARGH... aaahh..."' },
  h4: { cat: 'hero', voice: 'Alnilam', text: 'Roar out a loud, defiant, tragic last war cry that weakens into a dying breath: "RAAAAAAAH... haaahh..."' },
  // 승리 환호(후순위)
  v1: { cat: 'cheer', voice: 'Fenrir', text: CHEER('A young male soldier') },
  v2: { cat: 'cheer', voice: 'Alnilam', text: CHEER('A burly male soldier') },
  // 2026-11-08 단말마 재제작(사용자: 사망음이 신음처럼 길고 약함 -> 짧고 날카로운 '으악!'). 긴 PRE 문구는 낭독 사고가 나서 짧은 지시형만 사용
  k1: { cat: 'die', voice: 'Fenrir', text: SNAP('a young soldier') },
  k2: { cat: 'die', voice: 'Charon', text: SNAP('a deep-voiced soldier') },
  k3: { cat: 'die', voice: 'Orus', text: SNAP('a strong soldier') },
  k4: { cat: 'die', voice: 'Puck', text: SNAP('a young recruit') },
  hk1: { cat: 'hero', voice: 'Charon', text: 'Shout one single loud, sharp, defiant death scream that is suddenly cut off, under one second, no fading moan: "AAAAGH!" ... "GWAAAH!"' },
  hk2: { cat: 'hero', voice: 'Alnilam', text: 'Shout one single loud, sharp, defiant death scream that is suddenly cut off, under one second, no fading moan: "RAAAGH!" ... "UWAAAH!"' },
  hkf: { cat: 'hero', voice: 'Gacrux', text: 'Cry out one single loud, sharp, heroic death scream that is suddenly cut off, under one second, no sigh: "AAAAH!" ... "HAAAH!"' },
  // hkf 가 블라인드 QA 에서 남성으로 판정 -> 밝은 여성 목소리로 1회 재시도
  hkf2: { cat: 'hero', voice: 'Zephyr', text: 'A woman warrior cries out one single loud, sharp, high death scream that is suddenly cut off, under one second, no sigh: "AAAAH!" ... "KYAAAH!"' },
};

export const pitchChinese: Readonly<Record<string, string>> = {
  'Could not inspect vocal timing; using lyrics: {error}':
    '干声起唱时间检测失败，已回退歌词时间：{error}',
  'This song has an older LRC cache. Import the original LRC again to restore word timing and line endings; AI analysis is not required.':
    '此歌曲使用旧版LRC缓存，请重新导入原LRC以恢复逐字及句尾时间，无需重新进行AI分析。',
  'Pitch timeline: {seconds} seconds. The center line is now; upcoming reference pitch is on the right.':
    '音高时间轴：{seconds}秒。中线表示当前时刻，右侧为即将演唱的参考音高。',
  'Checking the saved singing start and song timing…': '正在确认已保存的起唱位置与歌曲时间…',
  'No reliable intro boundary is available.': '未找到可靠的前奏边界。',
  'Already at or past the intro skip point.': '已到达或超过跳过前奏的位置。',
  'Vocal-track estimate: jump to {seconds}s, {lead}s before singing.':
    '按干声音轨估计：跳至 {seconds} 秒，距离起唱还有 {lead} 秒。',
  'First lyric timing: jump to {seconds}s, {lead}s before the line.':
    '按首句歌词时间：跳至 {seconds} 秒，提前 {lead} 秒。',
  'Saved singing start: jump to {seconds}s, {lead}s before the first line.':
    '按已保存的首句时间：跳至 {seconds} 秒，提前 {lead} 秒。',
  'Saved singing start is outside this song. Using automatic detection; edit the saved value to correct it.':
    '已保存的起唱时间超出当前歌曲，暂用自动识别；请编辑并修正该时间。',
  'Could not load singing start; using automatic detection: {error}':
    '无法读取起唱时间，暂用自动识别：{error}',
  'Could not synchronize singing start: {error}': '无法同步起唱时间：{error}',
  Now: '当前',
  'Reference pitch': '参考音高',
};

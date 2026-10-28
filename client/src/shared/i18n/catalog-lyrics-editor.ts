export const lyricsEditorChinese: Readonly<Record<string, string>> = {
  'Edit MV': '编辑MV',
  'Choose this song’s video and whether to show it during playback.':
    '选择这首歌的MV，并设置播放时是否显示。',
  'Loading MV selection…': '正在读取MV设置…',
  'MV selection unavailable': 'MV设置暂不可用',
  'Manually selected MV': '已人工选择MV',
  'Automatically matched MV': '已自动匹配MV',
  'No MV selected': '当前没有匹配到MV',
  'Enable MV for this song': '为这首歌启用MV',
  'MV is off; the selected file path is kept.': 'MV已关闭，所选视频路径仍会保留。',
  'Saving a path here will replace automatic matching for this song.':
    '保存此路径后，将优先使用人工选择的MV。',
  'MV display setting saved': 'MV启用设置已保存',
  'Could not update MV display: {error}': '更新MV启用设置失败：{error}',
  'MV video path': 'MV视频路径',
  'Choose MV file': '选择MV文件',
  'Save MV': '保存MV',
  'Restore automatic MV': '恢复自动匹配MV',
  'Current MV: {path}': '当前MV：{path}',
  'The MV plays silently; this song supplies the audio.': 'MV只显示画面，播放的声音来自这首歌曲。',
  'MV selection saved': 'MV设置已保存',
  'Could not save MV: {error}': '保存MV失败：{error}',
  'Could not load the MV selection.': '无法读取这首歌的MV设置。',
  'Could not choose MV file': '无法选择MV视频文件',
  Minutes: '分',
  Seconds: '秒',
  Milliseconds: '毫秒',
  'Saved manual start (original speed).': '已保存的人工起唱点（原速时间）。',
  'Estimating the automatic start. You can enter a time now.':
    '正在估计自动起唱点，您也可以直接手动输入。',
  'Automatic start from the vocal track (original speed).':
    '当前自动起唱点来自干声检测（原速时间）。',
  'Automatic start from lyrics (original speed).': '当前自动起唱点来自歌词时间（原速时间）。',
  'Start not identified. 00:00.000 is a placeholder; enter the start manually.':
    '尚未识别起唱点，00:00.000 仅为占位，请手动设置。',
  'Vocal detection is unavailable; using the lyric start. You can adjust it manually.':
    '干声检测暂不可用，已按歌词时间估计起唱点，可手动调整。',
  'Lyrics are unavailable; using the vocal start. You can adjust it manually.':
    '歌词暂不可用，已按干声估计起唱点，可手动调整。',
  'Automatic detection could not read the song. 00:00.000 is a placeholder; enter the start manually.':
    '自动检测未能读取歌曲，00:00.000 仅为占位，请手动设置。',
  'Minutes and seconds must be integers from 0 to 59, milliseconds from 0 to 999, and the total must be shorter than the song.':
    '分、秒须为 0～59 的整数，毫秒须为 0～999 的整数，合计时间须小于歌曲原始时长。',
  'First lyric start (intro calibration)': '首句开始时间（前奏校准）',
  'Automatic, or mm:ss.xxx / seconds': '自动，或输入 mm:ss.xxx / 秒数',
  'Save intro start': '保存起唱点',
  'Restore automatic intro': '恢复自动判断',
  'Only changes where Skip intro jumps. It does not shift lyrics, change audio, or run AI. Use original-speed time; 0 means no intro.':
    '只调整“跳过前奏”的位置，不整体平移歌词、不改音频，也不运行 AI。请输入原速时间；0 表示没有前奏。',
  'Enter a time from 0 up to the song duration, using seconds or mm:ss.xxx.':
    '请输入大于等于 0、且小于歌曲总时长的时间，格式为秒数或 mm:ss.xxx。',
  'Could not load this song’s intro calibration.': '无法读取这首歌的前奏校准设置。',
  'Intro start saved. Lyrics and audio timing are unchanged.':
    '起唱点已保存，歌词和音频时序保持不变。',
  'Could not save intro start: {error}': '保存起唱点失败：{error}',
  'Lyrics editor view': '歌词编辑视图',
  'Lyrics text': '歌词文本',
  'LRC timeline': 'LRC 时间轴',
  'Restore saved timing': '恢复已保存时间轴',
  'This view keeps word starts, ends, and pauses. Switching views does not save or realign lyrics.':
    '此视图保留字词的开始、结束和停顿时间。切换视图不会保存或重新对齐歌词。',
  'Timestamps are hidden here. Editing the words requires realignment when you save; unchanged lyrics keep their timing.':
    '此处只显示歌词正文。修改文字后保存需要重新对齐；未改动的歌词会保留原时序。',
  'Restore saved timing discards unsaved text edits. Saving plain text will run alignment.':
    '恢复时间轴会放弃未保存的正文修改。保存纯文本修改将运行歌词对齐。',
};

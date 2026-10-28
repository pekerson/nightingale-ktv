export const playlistChinese: Readonly<Record<string, string>> = {
  'Playlist saved. {count} songs queued for analysis.':
    '歌单设置已保存，已加入 {count} 首歌曲进行分析。',
  'Library sync is running. New songs will be analyzed automatically.':
    '正在自动同步歌库，新增歌曲随后会自动分析。',
  'Automatic analysis for {playlist}': '歌单自动分析：{playlist}',
  'Follow global': '跟随全局',
  On: '开启',
  Off: '关闭',
  'Could not save playlist analysis: {error}': '无法保存歌单自动分析设置：{error}',
  'An explicit Off in any playlist takes priority. Existing analysis jobs are not cancelled.':
    '同一首歌所属的任意歌单明确关闭时，优先关闭。已排队或正在分析的任务不会取消。',
};

export const audioDevicesChinese: Readonly<Record<string, string>> = {
  'Could not prepare playback volume: {error}': '无法设置播放初始音量：{error}',
  'Speaker outputs': '扬声器输出',
  'Selected speaker is unavailable. Reconnect it or refresh devices.':
    '所选扬声器暂不可用，请连接或刷新设备',
  'No selectable speakers are available. Check connections and audio permissions, then refresh.':
    '暂未获取到可选择的扬声器。请检查连接和音频权限，然后刷新。',
  'Selected speaker could not play audio. Check device connection and audio permissions, then refresh speakers.':
    '所选扬声器无法播放。请检查设备连接和音频权限，然后刷新扬声器。',
  'Speaker {number}': '扬声器 {number}',
  'Default speaker': '系统默认扬声器',
  'Second speaker off': '不使用第二个扬声器',
  'Select a specific device for speaker 1 before enabling speaker 2.':
    '启用第二个扬声器前，请先为扬声器1选择具体设备。',
  'Choose the sources played by each speaker. You can select more than one.':
    '分别选择每个扬声器播放的音源，可以多选混音。',
  Accompaniment: '伴奏',
  'Dry vocals': '干声',
  Microphone: '麦克风',
  'Audio sources': '播放音源',
  'Refresh audio devices': '刷新音频设备',
  'Allow audio device access': '授权访问音频设备',
  'Looking for available speakers…': '正在查找扬声器…',
  'No speaker devices were found. Connect a speaker and refresh.':
    '未找到扬声器，请连接设备后刷新。',
  'This device is already selected for the other output.': '另一路已选择此设备。',
  'Selected speaker is unavailable: {name}': '已选扬声器当前不可用：{name}',
  'Could not list speakers: {error}': '无法获取扬声器列表：{error}',
  'Device names may require microphone permission. Audio is not recorded while refreshing devices.':
    '显示设备名称可能需要麦克风权限；刷新设备时不会录制音频。',
  'Output device selection is unavailable in this browser. The default speaker will still work.':
    '当前浏览器不支持指定输出设备，仍可使用默认扬声器。',
  'Microphone routing requires microphone monitoring to be enabled during playback.':
    '播放麦克风音源时，还需在演唱界面开启麦克风监听。',
  'Without separated stems, accompaniment plays the original mix and dry vocals are unavailable.':
    '未分离的歌曲在伴奏通道播放原曲混音，无法独立播放干声。',
  'No sources selected: this speaker will be silent.': '未选择音源，此扬声器将保持静音。',
};

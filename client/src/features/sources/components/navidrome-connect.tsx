import { RemoteSourceConnectDialog } from '@/features/sources/components/connect';
import {
  useConnectNavidrome,
  useNavidromeLogin,
} from '@/features/sources/mutations/use-source-mutations';
import { useI18n } from '@/shared/i18n/use-i18n';

export const NavidromeConnectDialog = () => {
  const { t } = useI18n();
  const loginMutation = useNavidromeLogin();
  const connectMutation = useConnectNavidrome();

  return (
    <RemoteSourceConnectDialog
      mode="navidrome-connect"
      title={t('Connect to Navidrome')}
      description={
        <>
          {t(
            'Point Nightingale at a Navidrome (Subsonic-compatible) server. Audio is downloaded to your local cache on first analysis so the rest of the karaoke pipeline keeps working exactly like a folder library.',
          )}
        </>
      }
      urlInputId="navi-url"
      urlPlaceholder="https://navidrome.example.com"
      usernameInputId="navi-user"
      passwordInputId="navi-pass"
      loginMutation={loginMutation}
      connectMutation={connectMutation}
    />
  );
};

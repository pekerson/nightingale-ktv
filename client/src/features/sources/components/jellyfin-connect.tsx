import { RemoteSourceConnectDialog } from '@/features/sources/components/connect';
import {
  useConnectJellyfin,
  useJellyfinLogin,
} from '@/features/sources/mutations/use-source-mutations';
import { useI18n } from '@/shared/i18n/use-i18n';

export const JellyfinConnectDialog = () => {
  const { t } = useI18n();
  const loginMutation = useJellyfinLogin();
  const connectMutation = useConnectJellyfin();

  return (
    <RemoteSourceConnectDialog
      mode="jellyfin-connect"
      title={t('Connect to Jellyfin')}
      description={
        <>
          {t(
            'Point Nightingale at a Jellyfin server. Audio is downloaded to your local cache on first analysis so the rest of the karaoke pipeline keeps working exactly like a folder library.',
          )}
        </>
      }
      urlInputId="jelly-url"
      urlPlaceholder="https://jellyfin.example.com"
      usernameInputId="jelly-user"
      passwordInputId="jelly-pass"
      loginMutation={loginMutation}
      connectMutation={connectMutation}
      selection={{
        label: t('Libraries to import'),
        emptyMessage: t(
          "This server didn't report any libraries, so everything the account can see will be imported.",
        ),
        getItems: (login) =>
          login.libraries.map((library) => ({ id: library.id, label: library.name })),
      }}
    />
  );
};

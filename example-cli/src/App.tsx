import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  NexconnChat,
  NexconnError,
  getIntegrationStatus,
  type AreaCode,
} from 'react-native-nexconn';

const FIXTURE = 'Community CLI';

/**
 * Diagnostic screen for the first integration milestone.
 *
 * Credentials are typed in at runtime and kept only in memory. Obtain the user
 * token from your authenticated backend; never ship an App Secret or a fixed
 * token in an app.
 */
export default function App() {
  const [appKey, setAppKey] = useState('');
  const [areaCode, setAreaCode] = useState('SG');
  const [token, setToken] = useState('');
  const [peer, setPeer] = useState('');
  const [text, setText] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const append = useRef((line: string) =>
    setLog((lines) => [line, ...lines].slice(0, 100))
  ).current;

  useEffect(() => {
    getIntegrationStatus().then(
      (status) => append(`bridge ${JSON.stringify(status)}`),
      (error: unknown) => append(`bridge error ${String(error)}`)
    );
    const subscriptions = [
      NexconnChat.addConnectionStatusListener((event) =>
        append(`status ${event.status} (${event.nativeStatusCode})`)
      ),
      NexconnChat.addMessageListener(({ message, offline }) =>
        append(
          `${offline ? 'offline ' : ''}from ${message.senderUserId}: ${
            message.content.type === 'text'
              ? message.content.text
              : `[unsupported ${message.content.messageType}]`
          }`
        )
      ),
      NexconnChat.addErrorListener((error) =>
        append(`event error ${error.message}`)
      ),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      NexconnChat.disconnect().catch(() => {});
    };
  }, [append]);

  const run = (label: string, action: () => Promise<unknown>) => () => {
    action().then(
      (result) =>
        append(`${label} ok${result ? ` ${JSON.stringify(result)}` : ''}`),
      (error: unknown) =>
        append(
          error instanceof NexconnError
            ? `${label} failed [${error.category}/${error.nativeCode}] ${error.message}`
            : `${label} failed ${String(error)}`
        )
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Nexconn · {FIXTURE}</Text>
      <TextInput
        style={styles.input}
        placeholder="App Key"
        autoCapitalize="none"
        value={appKey}
        onChangeText={setAppKey}
      />
      <TextInput
        style={styles.input}
        placeholder="Area code (BJ, SG, NA, SA, OM)"
        autoCapitalize="characters"
        value={areaCode}
        onChangeText={setAreaCode}
      />
      <Button
        title="Initialize"
        onPress={run('initialize', () =>
          NexconnChat.initialize({ appKey, areaCode: areaCode as AreaCode })
        )}
      />
      <TextInput
        style={styles.input}
        placeholder="User token from your backend"
        autoCapitalize="none"
        secureTextEntry
        value={token}
        onChangeText={setToken}
      />
      <View style={styles.row}>
        <Button
          title="Connect"
          onPress={run('connect', () =>
            NexconnChat.connect({ token, timeoutSeconds: 20 })
          )}
        />
        <Button
          title="Disconnect"
          onPress={run('disconnect', () => NexconnChat.disconnect())}
        />
        <Button
          title="Status"
          onPress={run('status', () => NexconnChat.getConnectionStatus())}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Recipient user ID"
        autoCapitalize="none"
        value={peer}
        onChangeText={setPeer}
      />
      <TextInput
        style={styles.input}
        placeholder="Message"
        value={text}
        onChangeText={setText}
      />
      <Button
        title="Send text"
        onPress={run('send', () =>
          NexconnChat.sendDirectText({ targetUserId: peer, text })
        )}
      />
      {log.map((line, index) => (
        <Text key={`${log.length - index}`} selectable style={styles.log}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, gap: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#999', borderRadius: 6, padding: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  log: { fontFamily: 'Courier', fontSize: 12 },
});

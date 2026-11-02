import { useEffect, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { getIntegrationStatus } from 'react-native-nexconn';

export default function App() {
  const [status, setStatus] = useState('Checking native module…');
  useEffect(() => {
    let active = true;
    getIntegrationStatus().then(
      (value) => {
        if (active) setStatus(JSON.stringify(value, null, 2));
      },
      (error: unknown) => {
        if (active) setStatus(String(error));
      }
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text>Nexconn · Community CLI</Text>
      <Text selectable>{status}</Text>
      <Text>Bootstrap only. Nexconn Chat is not integrated yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
});

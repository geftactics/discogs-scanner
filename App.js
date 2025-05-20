import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { Vibration, ActivityIndicator } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [token, setToken] = useState(null);
  const [username, setUsername] = useState(null);
  const [inputToken, setInputToken] = useState('');
  const [screen, setScreen] = useState('home');
  const [result, setResult] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    const loadStored = async () => {
      const savedToken = await AsyncStorage.getItem('discogs_token');
      const savedUser = await AsyncStorage.getItem('discogs_username');
      if (savedToken) setToken(savedToken);
      if (savedUser) setUsername(savedUser);
    };
    loadStored();
  }, []);

  const handleSaveToken = async () => {
    if (!inputToken) return;
    try {
      const response = await fetch('https://api.discogs.com/oauth/identity', {
        headers: { Authorization: `Discogs token=${inputToken}` },
      });
      if (!response.ok) throw new Error('Invalid token');
      const data = await response.json();
      await AsyncStorage.setItem('discogs_token', inputToken);
      await AsyncStorage.setItem('discogs_username', data.username);
      setToken(inputToken);
      setUsername(data.username);
      setInputToken('');
    } catch (err) {
      Alert.alert('Error', 'Failed to validate token');
    }
  };

  const handleScan = async ({ data }) => {
    if (scannedRef.current || !token || !username) return;
    scannedRef.current = true;
    setScreen('home');
    setIsLoading(true);
    Vibration.vibrate(10);

    const [releaseId, instanceId] = data.trim().split('.');
    if (!/^\d+$/.test(releaseId) || !/^\d+$/.test(instanceId)) {
      Alert.alert('Invalid QR Code', 'Expected format: release_id.instance_id');
      scannedRef.current = false;
      setIsLoading(false);
      return;
    }

    try {
      const headers = { Authorization: `Discogs token=${token}` };
      const releaseUrl = `https://api.discogs.com/users/${username}/collection/releases/${releaseId}`;
      const releaseRes = await fetch(releaseUrl, { headers });
      const releaseData = await releaseRes.json();

      const match = releaseData.releases?.find(
        r =>
          r.basic_information.id.toString() === releaseId &&
          r.instance_id.toString() === instanceId
      );

      if (match) {
        const foldersRes = await fetch(
          `https://api.discogs.com/users/${username}/collection/folders`,
          { headers }
        );
        const foldersData = await foldersRes.json();
        setFolders(foldersData.folders.filter(f => f.id !== 0));
        setSelectedFolderId(match.folder_id);

        setResult({
          title: match.basic_information.title,
          artist: match.basic_information.artists.map(a => a.name).join(', '),
          label: match.basic_information.labels.map(l => l.name).join(', '),
          catno: match.basic_information.labels.map(l => l.catno).join(', '),
          thumb: match.basic_information.thumb,
          folder_id: match.folder_id,
          release_id: match.basic_information.id,
          instance_id: match.instance_id,
        });
        setHasScanned(true);
      } else {
        setResult(false);
        setHasScanned(true);
      }
    } catch (err) {
      console.error('API error:', err);
      Alert.alert('Error', 'Failed to query Discogs collection');
    } finally {
      scannedRef.current = false;
      setIsLoading(false);
    }
  };

  const handleMoveToFolder = async (targetFolderId) => {
    if (!result?.release_id || !result?.instance_id) {
      Alert.alert('Error', 'No scanned release to move.');
      return;
    }

    if (targetFolderId === selectedFolderId) {
      setIsPickerOpen(false);
      return;
    }

    try {
      const url = `https://api.discogs.com/users/${username}/collection/folders/${selectedFolderId}/releases/${result.release_id}/instances/${result.instance_id}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Discogs token=${token}`,
        },
        body: JSON.stringify({ folder_id: targetFolderId }),
      });

      if (!response.ok) throw new Error('Failed to move record');
      Alert.alert('Success', `Moved to '${folders.find(f => f.id === targetFolderId)?.name}'`);
      setSelectedFolderId(targetFolderId);
    } catch (err) {
      console.error('Move error:', err);
      Alert.alert('Error', 'Could not move record');
    } finally {
      setIsPickerOpen(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.message}>Camera access is required to scan items.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (screen === 'camera') {
    return (
      <View style={styles.containerCamera}>
        <CameraView
          style={styles.cameraHalf}
          onBarcodeScanned={handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.bottomHalf}>
          <Button title="Cancel" onPress={() => setScreen('home')} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!token || !username ? (
        <>
          <Text style={styles.header}>Discogs Personal Access Token</Text>
          <Text style={styles.message}>We need this for the app to access your collection.</Text>
          <Text style={styles.message}>You'll need to generate a new token, and then paste the letters/numbers into the box below!</Text>
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://www.discogs.com/settings/developers')}
          >
            Get your token from Discogs
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Paste token here"
            value={inputToken}
            onChangeText={setInputToken}
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleSaveToken}>
            <Text style={styles.buttonText}>Save Token</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.header}>Discogs: {username}</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => {
              setResult(null);
              setFolders([]);
              setSelectedFolderId(null);
              setHasScanned(false);
              setScreen('camera');
            }}
          >
            <MaterialIcons name="qr-code-scanner" size={24} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>Scan item</Text>
          </TouchableOpacity>

          {isLoading && (
            <View style={styles.result}>
              <ActivityIndicator size="large" color="#333" />
            </View>
          )}

          {!isLoading && hasScanned && !result && (
            <View style={styles.result}>
              <Text style={styles.message}>Not found in collection!</Text>
            </View>
          )}

          {!isLoading && result && (
            <View style={styles.result}>
              <Text style={styles.resultTitle}>{result.title}</Text>
              <Text style={styles.resultArtist}>{result.artist}</Text>
              {result.thumb && <Image source={{ uri: result.thumb }} style={styles.thumb} />}
              <Text style={styles.resultLabel}>{result.label} ({result.catno})</Text>

              <TouchableOpacity style={styles.pickerTrigger} onPress={() => setIsPickerOpen(!isPickerOpen)}>
                <Text style={styles.pickerTriggerText}>
                  Location: {folders.find(f => f.id === selectedFolderId)?.name || 'Unknown'}
                </Text>
              </TouchableOpacity>

              {isPickerOpen && (
                <View style={styles.pickerList}>
                  {folders.map(folder => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        styles.pickerItem,
                        folder.id === selectedFolderId && styles.pickerItemSelected,
                      ]}
                      onPress={() => handleMoveToFolder(folder.id)}
                    >
                      <Text style={styles.pickerItemText}>{folder.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'stretch',
    backgroundColor: 'white',
    padding: 20,
  },
  containerCamera: {
    flexGrow: 1,
    alignItems: 'stretch',
    backgroundColor: 'black',
    padding: 0,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 80,
  },
  link: {
    color: 'blue',
    textAlign: 'center',
    marginBottom: 12,
    textDecorationLine: 'underline',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 30,
    marginTop: 30,
  },
  primaryButton: {
    backgroundColor: '#6200ee',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
  },
  scanButton: {
    backgroundColor: '#6200ee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  message: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 16,
  },
  result: {
    padding: 16,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 300,
    justifyContent: 'center'
  },
  resultArtist: {
    fontSize: 18,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  resultLabel: {
    fontSize: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  thumb: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginVertical: 10,
  },
  pickerTrigger: {
    backgroundColor: '#eee',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  pickerTriggerText: {
    fontSize: 16,
  },
  pickerList: {
    marginTop: 8,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  pickerItemSelected: {
    backgroundColor: '#d1c4e9',
  },
  pickerItemText: {
    fontSize: 16,
  },
  cameraHalf: {
    flex: 1,
  },
  bottomHalf: {
    padding: 16,
    backgroundColor: 'white',
  },
});

import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState, useRef } from 'react';
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
  const [screen, setScreen] = useState('home'); // 'home' | 'camera'
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scannedRef = useRef(false);

  // Load token and username on startup
  useEffect(() => {
    const loadStored = async () => {
      const savedToken = await AsyncStorage.getItem('discogs_token');
      const savedUser = await AsyncStorage.getItem('discogs_username');
      if (savedToken) setToken(savedToken);
      if (savedUser) setUsername(savedUser);
    };
    loadStored();
  }, []);

  // Save token and fetch username
  const handleSaveToken = async () => {
    if (!inputToken) return;
    try {
      console.log('Checking token...')
      const response = await fetch('https://api.discogs.com/oauth/identity', {
        headers: {
          Authorization: `Discogs token=${inputToken}`,
        },
      });
      console.log('Check token ', response.status)
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
  
    const tokenHeader = { Authorization: `Discogs token=${token}` };
  
    const parts = data.trim().split('.');
    if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
      Alert.alert('Invalid QR Code', 'Expected format: release_id.instance_id');
      scannedRef.current = false;
      return;
    }
  
    const releaseId = parts[0];
    const instanceId = parts[1];
    console.log("Scanned release ID:", releaseId);
    console.log("Scanned instance ID:", instanceId);
  
    try {
      const releaseUrl = `https://api.discogs.com/users/${username}/collection/releases/${releaseId}`;
      const releaseResponse = await fetch(releaseUrl, { headers: tokenHeader });
      const releaseJson = await releaseResponse.json();
      const match = releaseJson.releases.find(
        r => r.basic_information.id.toString() === releaseId &&
             r.instance_id.toString() === instanceId
      );
      
      if (match) {
        console.log('Found a match for both release_id and instance_id')
        const foldersUrl = `https://api.discogs.com/users/${username}/collection/folders`;
        const foldersResponse = await fetch(foldersUrl, { headers: tokenHeader });
        const foldersJson = await foldersResponse.json();
  
        setFolders(foldersJson.folders.filter(f => f.id !== 0)); // remove "All"
        setSelectedFolderId(match.folder_id);
  
        setResult({
          title: match.basic_information.title,
          artist: match.basic_information.artists.map(a => a.name).join(', '),
          label: match.basic_information.labels.map(l => l.name).join(', '),
          thumb: match.basic_information.thumb,
          folder: match.folder_id,
          release_id: match.basic_information.id,
          instance_id: match.instance_id,
        });
      } else {
        console.log('Did not find a match')
        setResult({ title: "Not found in collection!" });
      }
    } catch (err) {
      console.error('API error:', err);
      Alert.alert('Error', 'Failed to query Discogs collection');
    } finally {
      scannedRef.current = false;
    }
  };
  

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, marginBottom: 16 }}>Camera access is required to scan items.</Text>
        <TouchableOpacity
          style={{
            backgroundColor: '#6200ee',
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 8,
          }}
          onPress={requestPermission}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>Grant Camera Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screen === 'camera') {
    return (
      <View style={styles.container}>
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
          <Text style={styles.header}>Enter Discogs Personal Access Token</Text>
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
          <TouchableOpacity
            style={{
              backgroundColor: '#6200ee',
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              marginTop: 16,
              alignSelf: 'center',
            }}
            onPress={handleSaveToken}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>Save Token</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.header}>Discogs: {username}</Text>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => {
              setResult(null);       // Clear previous release
              setFolders(null);        // Clear folder info
              setSelectedFolderId(null);
              setScreen('camera');    // Show the camera
            }}
          >
            <MaterialIcons name="qr-code-scanner" size={24} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.scanButtonText}>Scan item</Text>
          </TouchableOpacity>
          {result && result.title == "Not found in collection!" && (<Text style={styles.message}>Not found in collection!</Text>) }
          {result && result.title !== "Not found in collection!" && (
  <View style={styles.result}>
    <Text style={styles.resultTitle}>{result.artist}</Text>
    <Text style={styles.resultTitle}>{result.title}</Text>
    {result.thumb && <Image source={{ uri: result.thumb }} style={styles.thumb} />}
    <Text style={styles.resultLabel}>{result.label}</Text>

    {/* Folder Dropdown */}
    <TouchableOpacity
      style={styles.pickerTrigger}
      onPress={() => setIsPickerOpen((prev) => !prev)}
    >
      <Text style={styles.pickerTriggerText}>
        Location: {folders.find(f => f.id === selectedFolderId)?.name || 'Unknown'}
      </Text>
    </TouchableOpacity>

    {isPickerOpen && (
      <View style={styles.pickerList}>
        {folders.map((folder) => (
          <TouchableOpacity
            key={folder.id}
            style={[
              styles.pickerItem,
              folder.id === selectedFolderId && styles.pickerItemSelected,
            ]}
            onPress={async () => {
              const targetFolderId = folder.id;
            
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
            
                Alert.alert('Success', `Moved to '${folder.name}'`);
                setSelectedFolderId(targetFolderId);
              } catch (err) {
                console.error('Move error:', err);
                Alert.alert('Error', 'Could not move record');
              } finally {
                setIsPickerOpen(false);
              }
            }}
            
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
    padding: 0,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 10,
    paddingTop: 200,
  },
  header: {
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    paddingTop: 100,
  },
  link: {
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 10,
    textDecorationLine: 'underline',
  },
  input: {
    borderColor: '#999',
    borderWidth: 1,
    padding: 10,
    marginVertical: 12,
    marginHorizontal: 20,
    borderRadius: 8,
  },
  cameraHalf: {
    height: '90%',
    width: '100%',
  },
  bottomHalf: {
    height: '10%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  result: {
    marginTop: 30,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 5,
  },
  resultLabel: {
    fontSize: 18,
    fontWeight: '300',
  },
  thumb: {
    width: 150,
    height: 150,
    marginBottom: 10,
  },
  pickerTrigger: {
    padding: 12,
    backgroundColor: '#eee',
    borderRadius: 6,
    marginTop: 20,
  },
  pickerTriggerText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerList: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
  },
  pickerItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  pickerItemSelected: {
    backgroundColor: '#ddd',
  },
  pickerItemText: {
    fontSize: 16,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  
});

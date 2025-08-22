import React, { useState, useEffect, useCallback } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Power, 
  Speaker, 
  Lightbulb, 
  Settings,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  LogOut,
  RefreshCw,
  Snowflake,
  Terminal,
  Trash2,
  Database,
  Calendar,
  Timer,
  Target
} from 'lucide-react';
import mqtt from 'mqtt';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardProps {
  onLogout: () => void;
}

interface SensorData {
  temperature: number;
  humidity: number;
  tempMin: number;
  tempMax: number;
  tempMinDay: number;
  tempMaxDay: number;
  alertActive: boolean;
  systemEnabled: boolean;
  wifiConnected: boolean;
  mqttConnected: boolean;
  uptime: number;
  readingsSuccessful: number;
  sendingsSuccessful: number;
  displayAvailable: boolean;
}

interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const [mqttClient, setMqttClient] = useState<mqtt.MqttClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: 0,
    humidity: 0,
    tempMin: 2.0,       // Límite mínimo configurado
    tempMax: 8.0,       // Límite máximo configurado
    tempMinDay: 0,      // Temperatura mínima registrada en el día
    tempMaxDay: 0,      // Temperatura máxima registrada en el día
    alertActive: false,
    systemEnabled: true,
    wifiConnected: false,
    mqttConnected: false,
    uptime: 0,
    readingsSuccessful: 0,
    sendingsSuccessful: 0,
    displayAvailable: false
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [thingSpeakData, setThingSpeakData] = useState<{
    temperatura: number;
    humedad: number;
    temp_min_dia: number;
    temp_max_dia: number;
    alerta_activa: boolean;
    display_disponible: boolean;
    created_at: Date;
    entry_id: number;
  } | null>(null);
  const [lastThingSpeakUpdate, setLastThingSpeakUpdate] = useState<Date | null>(null);

  // Estados de control
  const [relayState, setRelayState] = useState(false);
  const [buzzerState, setBuzzerState] = useState(false);
  const [ledState, setLedState] = useState(false);
  const [newTempMin, setNewTempMin] = useState('2.0');
  const [newTempMax, setNewTempMax] = useState('8.0');

  // Cargar valores guardados de localStorage al inicializar
  useEffect(() => {
    const storagePrefix = import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'cadena-frio';
    const savedTempMin = localStorage.getItem(`${storagePrefix}-temp-min`);
    const savedTempMax = localStorage.getItem(`${storagePrefix}-temp-max`);
    
    if (savedTempMin) {
      setNewTempMin(savedTempMin);
      setSensorData(prev => ({ ...prev, tempMin: parseFloat(savedTempMin) }));
    }
    
    if (savedTempMax) {
      setNewTempMax(savedTempMax);
      setSensorData(prev => ({ ...prev, tempMax: parseFloat(savedTempMax) }));
    }
    
    if (savedTempMin || savedTempMax) {
      addLog('info', `Rangos de temperatura cargados: Min ${savedTempMin || '2.0'}°C, Max ${savedTempMax || '8.0'}°C`);
    }
  }, []);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const newLog: LogEntry = {
      id: Date.now() + Math.random(), // Usar timestamp + random para garantizar unicidad
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };
    setLogs(prev => [newLog, ...prev.slice(0, 49)]); // Mantener solo los últimos 50 logs
  }, []);

  // Función para obtener datos de ThingSpeak
  const fetchThingSpeakData = useCallback(async () => {
    try {
      const apiKey = import.meta.env.VITE_THINGSPEAK_API_KEY;
      const channelId = import.meta.env.VITE_THINGSPEAK_CHANNEL_ID;
      
      if (!apiKey || !channelId) {
        console.error('ThingSpeak API key o Channel ID no configurados');
        addLog('error', 'Configuración de ThingSpeak incompleta');
        return;
      }
      
      const response = await fetch(
        `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=1`
      );
      const data = await response.json();
      
      if (data && data.feeds && data.feeds.length > 0) {
        const latestFeed = data.feeds[0];
        // Log para depurar el estado del display
        console.log('ThingSpeak field6 (display):', latestFeed.field6);
        
        setThingSpeakData({
          temperatura: parseFloat(latestFeed.field1) || 0,
          humedad: parseFloat(latestFeed.field2) || 0,
          temp_min_dia: parseFloat(latestFeed.field3) || 0,
          temp_max_dia: parseFloat(latestFeed.field4) || 0,
          alerta_activa: latestFeed.field5 === '1',
          display_disponible: latestFeed.field6 === '1',
          created_at: new Date(latestFeed.created_at),
          entry_id: parseInt(latestFeed.entry_id) || 0
        });
        setLastThingSpeakUpdate(new Date());
        
        addLog('info', `Datos ThingSpeak actualizados - Temp: ${latestFeed.field1}°C, Humedad: ${latestFeed.field2}%, Display: ${latestFeed.field6 === '1' ? 'OK' : 'Error'}`);
      }
    } catch (error) {
      console.error('Error fetching ThingSpeak data:', error);
      addLog('error', 'Error al obtener datos de ThingSpeak');
    }
  }, [addLog]);

  useEffect(() => {
    // Conectar a MQTT con opciones de reconexión mejoradas
    const mqttBrokerUrl = import.meta.env.VITE_MQTT_BROKER_URL || 'wss://broker.hivemq.com:8884/mqtt';
    const reconnectPeriod = parseInt(import.meta.env.VITE_MQTT_RECONNECT_PERIOD) || 5000;
    const connectTimeout = parseInt(import.meta.env.VITE_MQTT_CONNECT_TIMEOUT) || 30000;
    const keepalive = parseInt(import.meta.env.VITE_MQTT_KEEPALIVE) || 60;
    
    const client = mqtt.connect(mqttBrokerUrl, {
      reconnectPeriod,      // Intentar reconectar cada 5 segundos
      connectTimeout,      // Tiempo de espera de conexión de 30 segundos
      keepalive,              // Mantener viva la conexión
      clean: true,                // Sesión limpia
      clientId: `${import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'cadena-frio'}-dashboard-${Math.random().toString(16).substring(2, 10)}` // ID de cliente único
    });
    
    let isFirstConnect = true;
    
    client.on('connect', () => {
      setConnectionStatus('connected');
      
      // Solo registrar el mensaje de conexión la primera vez o después de una desconexión
      if (isFirstConnect) {
        addLog('success', 'Conectado al broker MQTT');
        isFirstConnect = false;
      } else {
        addLog('success', 'Reconectado al broker MQTT');
      }
      
      // Suscribirse a todos los tópicos relevantes
      const topics = [
        import.meta.env.VITE_MQTT_TOPIC_TEMPERATURA || 'cadena-frio/temperatura',
        import.meta.env.VITE_MQTT_TOPIC_HUMEDAD || 'cadena-frio/humedad',
        import.meta.env.VITE_MQTT_TOPIC_ESTADO || 'cadena-frio/estado',
        `${import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'cadena-frio'}/alertas`
      ];
      
      topics.forEach(topic => {
        client.subscribe(topic, { qos: 1 as 0 | 1 | 2 }); // Usar QoS 1 para garantizar la entrega
      });
      
      // Solicitar estado inicial solo después de suscribirse a todos los tópicos
      const controlTopic = import.meta.env.VITE_MQTT_TOPIC_CONTROL_SISTEMA || 'cadena-frio/control/sistema';
      client.publish(controlTopic, 'STATUS', { qos: 1 as 0 | 1 | 2, retain: false });
    });

    client.on('reconnect', () => {
      setConnectionStatus('connecting');
      addLog('warning', 'Intentando reconectar al broker MQTT...');
    });
    
    client.on('offline', () => {
      setConnectionStatus('disconnected');
      addLog('warning', 'Conexión MQTT perdida. Intentando reconectar...');
    });

    client.on('error', (error) => {
      setConnectionStatus('disconnected');
      addLog('error', `Error MQTT: ${error.message}`);
    });
    
    client.on('disconnect', () => {
      setConnectionStatus('disconnected');
      addLog('warning', 'Desconectado del broker MQTT');
    });
    
    // Verificar periódicamente el estado de la conexión
    const connectionCheckInterval = setInterval(() => {
      if (client && client.connected) {
        setConnectionStatus('connected');
      } else if (client && !client.connected && connectionStatus !== 'connecting') {
        setConnectionStatus('disconnected');
      }
    }, 5000); // Verificar cada 5 segundos

    // Usar un conjunto para rastrear mensajes recientes y evitar duplicados
    const recentMessages = new Set<string>();
    const MESSAGE_EXPIRY_TIME = 2000; // 2 segundos para considerar un mensaje como duplicado
    
    client.on('message', (topic, message) => {
      const messageStr = message.toString();
      const messageId = `${topic}:${messageStr}:${Date.now()}`;
      
      // Verificar si es un mensaje duplicado reciente
      const isDuplicate = Array.from(recentMessages).some(id => {
        const [storedTopic, storedMessage] = id.split(':', 2);
        return storedTopic === topic && storedMessage === messageStr;
      });
      
      if (isDuplicate) {
        // Ignorar mensajes duplicados
        console.log('Mensaje duplicado ignorado:', topic, messageStr);
        return;
      }
      
      // Agregar mensaje al conjunto de mensajes recientes
      recentMessages.add(messageId);
      
      // Limpiar mensajes antiguos después de un tiempo
      setTimeout(() => {
        recentMessages.delete(messageId);
      }, MESSAGE_EXPIRY_TIME);
      
      // Registrar el mensaje en la consola
      addLog('info', `${topic}: ${messageStr}`);

      const temperaturaTopic = import.meta.env.VITE_MQTT_TOPIC_TEMPERATURA || 'cadena-frio/temperatura';
      const humedadTopic = import.meta.env.VITE_MQTT_TOPIC_HUMEDAD || 'cadena-frio/humedad';
      const estadoTopic = import.meta.env.VITE_MQTT_TOPIC_ESTADO || 'cadena-frio/estado';
      const alertasTopic = `${import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'cadena-frio'}/alertas`;
      
      switch (topic) {
        case temperaturaTopic: {
          const tempValue = parseFloat(messageStr);
          if (!isNaN(tempValue)) {
            setSensorData(prev => ({ ...prev, temperature: tempValue }));
          }
          break;
        }
          
        case humedadTopic: {
          const humValue = parseFloat(messageStr);
          if (!isNaN(humValue)) {
            setSensorData(prev => ({ ...prev, humidity: humValue }));
          }
          break;
        }
          
        case estadoTopic:
          // Intentar parsear JSON si es posible
          try {
            const data = JSON.parse(messageStr);
            console.log('Datos recibidos:', data);
            
            // Crear un objeto con solo los campos válidos para actualizar
            const validUpdates: Partial<SensorData> = {};
            
            // Validar y agregar cada campo si es válido
            if (typeof data.temperature === 'number' && !isNaN(data.temperature)) {
              validUpdates.temperature = data.temperature;
            }
            
            if (typeof data.humidity === 'number' && !isNaN(data.humidity)) {
              validUpdates.humidity = data.humidity;
            }
            
            if (typeof data.tempMin === 'number' && !isNaN(data.tempMin)) {
              validUpdates.tempMin = data.tempMin;
            }
            
            if (typeof data.tempMax === 'number' && !isNaN(data.tempMax)) {
              validUpdates.tempMax = data.tempMax;
            }
            
            if (typeof data.tempMinDay === 'number' && !isNaN(data.tempMinDay)) {
              validUpdates.tempMinDay = data.tempMinDay;
              addLog('info', `Temperatura mínima del día actualizada: ${data.tempMinDay.toFixed(1)}°C`);
            }
            
            if (typeof data.tempMaxDay === 'number' && !isNaN(data.tempMaxDay)) {
              validUpdates.tempMaxDay = data.tempMaxDay;
              addLog('info', `Temperatura máxima del día actualizada: ${data.tempMaxDay.toFixed(1)}°C`);
            }
            
            if (typeof data.systemEnabled === 'boolean') {
              validUpdates.systemEnabled = data.systemEnabled;
            }
            
            if (typeof data.alertActive === 'boolean') {
              validUpdates.alertActive = data.alertActive;
            }
            
            if (typeof data.wifi_conectado === 'boolean') {
              validUpdates.wifiConnected = data.wifi_conectado;
            } else if (typeof data.wifiConnected === 'boolean') {
              validUpdates.wifiConnected = data.wifiConnected;
            }
            
            if (typeof data.mqtt_conectado === 'boolean') {
              validUpdates.mqttConnected = data.mqtt_conectado;
            } else if (typeof data.mqttConnected === 'boolean') {
              validUpdates.mqttConnected = data.mqttConnected;
            }
            
            if (typeof data.uptime === 'number' && !isNaN(data.uptime)) {
              validUpdates.uptime = data.uptime;
            }
            
            // Registrar los datos recibidos para depuración
            console.log('Datos de estado recibidos:', {
              wifi: data.wifi_conectado || data.wifiConnected,
              mqtt: data.mqtt_conectado || data.mqttConnected,
              lecturas: data.lecturas_exitosas || data.readingsSuccessful,
              envios: data.envios_exitosos || data.sendingsSuccessful,
              uptime: data.uptime
            });
            
            if (typeof data.lecturas_exitosas === 'number' && !isNaN(data.lecturas_exitosas)) {
              validUpdates.readingsSuccessful = data.lecturas_exitosas;
            } else if (typeof data.readingsSuccessful === 'number' && !isNaN(data.readingsSuccessful)) {
              validUpdates.readingsSuccessful = data.readingsSuccessful;
            }
            
            if (typeof data.envios_exitosos === 'number' && !isNaN(data.envios_exitosos)) {
              validUpdates.sendingsSuccessful = data.envios_exitosos;
            } else if (typeof data.sendingsSuccessful === 'number' && !isNaN(data.sendingsSuccessful)) {
              validUpdates.sendingsSuccessful = data.sendingsSuccessful;
            }
            
            // Manejar el estado del display
            if (typeof data.display_disponible === 'boolean') {
              validUpdates.displayAvailable = data.display_disponible;
              addLog('info', `Estado del display: ${data.display_disponible ? 'OK' : 'Error'}`);
            } else if (typeof data.displayAvailable === 'boolean') {
              validUpdates.displayAvailable = data.displayAvailable;
              addLog('info', `Estado del display: ${data.displayAvailable ? 'OK' : 'Error'}`);
            }
            
            // Actualizar el estado solo si hay cambios válidos
            if (Object.keys(validUpdates).length > 0) {
              setSensorData(prev => ({
                ...prev,
                ...validUpdates
              }));
            }
            
            // Verificar si la temperatura está fuera de los límites
            if (validUpdates.temperature !== undefined && 
                validUpdates.tempMin !== undefined && 
                validUpdates.temperature < validUpdates.tempMin) {
              addLog('warning', `Temperatura por debajo del límite: ${validUpdates.temperature.toFixed(1)}°C (Mín: ${validUpdates.tempMin.toFixed(1)}°C)`);
            } else if (validUpdates.temperature !== undefined && 
                       validUpdates.tempMax !== undefined && 
                       validUpdates.temperature > validUpdates.tempMax) {
              addLog('warning', `Temperatura por encima del límite: ${validUpdates.temperature.toFixed(1)}°C (Máx: ${validUpdates.tempMax.toFixed(1)}°C)`);
            }
          } catch {
            // Si no es JSON, tratar como un mensaje de estado simple
            // Limpiar caracteres especiales que pueden causar problemas de JSON
            const cleanMessage = messageStr.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim();
            
            if (cleanMessage.includes('conectado') || cleanMessage.includes('ÓPTIMA')) {
              addLog('success', `Estado del sistema: ${cleanMessage}`);
            } else {
              addLog('info', `Estado del sistema: ${cleanMessage}`);
            }
            console.warn('Mensaje no JSON recibido:', cleanMessage);
          }
          break;
          
        case import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/alertas` : 'cadena-frio/alertas':
          addLog('warning', `ALERTA: ${messageStr}`);
          break;
      }
    });

    setMqttClient(client);

    // Función de limpieza mejorada para cuando el componente se desmonte
    return () => {
      // Limpiar el intervalo de verificación de conexión
      clearInterval(connectionCheckInterval);
      
      if (client) {
        // Desuscribirse de todos los tópicos antes de cerrar
        const topics = [
          import.meta.env.VITE_MQTT_TOPIC_TEMPERATURA || 'cadena-frio/temperatura',
          import.meta.env.VITE_MQTT_TOPIC_HUMEDAD || 'cadena-frio/humedad',
          import.meta.env.VITE_MQTT_TOPIC_ESTADO || 'cadena-frio/estado',
          import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/alertas` : 'cadena-frio/alertas'
        ];
        
        // Desuscribirse de cada tópico
        topics.forEach(topic => {
          client.unsubscribe(topic);
        });
        
        // Publicar mensaje de desconexión si es posible
        if (connectionStatus === 'connected') {
          try {
            const disconnectTopic = import.meta.env.VITE_MQTT_TOPIC_CONTROL_SISTEMA || 'cadena-frio/control/sistema';
        client.publish(disconnectTopic, 'DISCONNECT', { qos: 0 }, () => {
              // Cerrar la conexión después de enviar el mensaje de desconexión
              client.end(true, () => {
                console.log('Conexión MQTT cerrada correctamente');
              });
            });
          } catch {
            // Si falla el intento de publicar, cerrar de todos modos
            client.end(true);
          }
        } else {
          // Si no está conectado, simplemente cerrar
          client.end(true);
        }
      }
    };
  }, [fetchThingSpeakData]);

  // Obtener datos de ThingSpeak cada intervalo configurado
    fetchThingSpeakData(); // Obtener datos iniciales
    
    const updateInterval = parseInt(import.meta.env.VITE_THINGSPEAK_UPDATE_INTERVAL) || 120000;
    const thingSpeakInterval = setInterval(() => {
      fetchThingSpeakData();
    }, updateInterval);

    return () => clearInterval(thingSpeakInterval);
  }, []);

  // Función mejorada para publicar comandos con reintentos y confirmación
  const publishCommand = (topic: string, command: string) => {
    if (!mqttClient) {
      addLog('error', 'Cliente MQTT no inicializado');
      return;
    }
    
    if (connectionStatus !== 'connected') {
      addLog('warning', 'Intentando enviar comando sin conexión MQTT establecida');
      // Intentar reconectar si no está conectado
      if (mqttClient.reconnect) {
        mqttClient.reconnect();
      }
      setTimeout(() => {
        if (mqttClient && mqttClient.connected) {
          // Si se conectó después de esperar, enviar el comando
          sendCommandWithQoS();
        } else {
          addLog('error', 'No se pudo establecer conexión MQTT para enviar comando');
        }
      }, 2000); // Esperar 2 segundos para la reconexión
      return;
    }
    
    // Función para enviar el comando con QoS
    function sendCommandWithQoS() {
      if (mqttClient) {
        const options = {
          qos: 1 as 0 | 1 | 2,           // Garantizar entrega al menos una vez
          retain: false,    // No retener el mensaje
        };
        
        mqttClient.publish(topic, command, options, (error?: Error) => {
          if (error) {
            console.error('Error al publicar:', error);
            addLog('error', `Error al enviar comando: ${error.message}`);
          } else {
            addLog('success', `Comando enviado - ${topic}: ${command}`);
          }
        });
      }
    }
    
    // Enviar el comando inmediatamente si ya está conectado
    sendCommandWithQoS();
  };

  const handleRelayToggle = () => {
    const newState = !relayState;
    setRelayState(newState);
    const topic = import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/control/relay` : 'cadena-frio/control/relay';
    publishCommand(topic, newState ? 'ON' : 'OFF');
  };

  const handleBuzzerToggle = () => {
    const newState = !buzzerState;
    setBuzzerState(newState);
    const topic = import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/control/buzzer` : 'cadena-frio/control/buzzer';
    publishCommand(topic, newState ? 'ON' : 'OFF');
  };

  const handleBuzzerBeep = () => {
    const topic = import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/control/buzzer` : 'cadena-frio/control/buzzer';
    publishCommand(topic, 'BEEP');
  };

  const handleLedToggle = () => {
    const newState = !ledState;
    setLedState(newState);
    const topic = import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/control/led` : 'cadena-frio/control/led';
    publishCommand(topic, newState ? 'ON' : 'OFF');
  };



  const handleUpdateLimits = () => {
    // Validate that the values are valid numbers
    const minTemp = parseFloat(newTempMin);
    const maxTemp = parseFloat(newTempMax);
    
    if (isNaN(minTemp) || isNaN(maxTemp)) {
      addLog('error', 'Los límites deben ser valores numéricos válidos');
      return;
    }
    
    const command = `MIN:${minTemp},MAX:${maxTemp}`;
    const topic = import.meta.env.VITE_MQTT_TOPIC_PREFIX ? `${import.meta.env.VITE_MQTT_TOPIC_PREFIX}/control/limites` : 'cadena-frio/control/limites';
    publishCommand(topic, command);
    
    // Actualizar los valores en el estado local para mostrarlos inmediatamente
    setSensorData(prev => ({
      ...prev,
      tempMin: minTemp,
      tempMax: maxTemp
    }));
    
    // Guardar los valores en localStorage para persistencia
    const storagePrefix = import.meta.env.VITE_MQTT_TOPIC_PREFIX || 'cadena-frio';
    localStorage.setItem(`${storagePrefix}-temp-min`, minTemp.toString());
    localStorage.setItem(`${storagePrefix}-temp-max`, maxTemp.toString());
    
    // Mostrar mensaje de confirmación
    addLog('success', `Límites de temperatura actualizados y guardados: Min ${minTemp}°C, Max ${maxTemp}°C`);
  };

  const handleSystemToggle = () => {
    const command = sensorData.systemEnabled ? 'DISABLE' : 'ENABLE';
    const topic = import.meta.env.VITE_MQTT_TOPIC_CONTROL_SISTEMA || 'cadena-frio/control/sistema';
    publishCommand(topic, command);
  };


  
  const handleDisplayReset = () => {
    const topic = import.meta.env.VITE_MQTT_TOPIC_CONTROL_SISTEMA || 'cadena-frio/control/sistema';
    publishCommand(topic, 'DISPLAY_RESET');
    addLog('info', 'Comando de reinicio del display enviado');
  };

  const getTemperatureColor = (temp: number) => {
    if (temp < sensorData.tempMin) return 'text-blue-500';
    if (temp > sensorData.tempMax) return 'text-red-500';
    return 'text-green-500';
  };

  const getTemperatureStatus = (temp: number) => {
    if (temp < 0) return 'CONGELACIÓN';
    if (temp < sensorData.tempMin) return 'MUY FRÍA';
    if (temp >= sensorData.tempMin && temp <= sensorData.tempMax) return 'ÓPTIMA';
    if (temp > sensorData.tempMax && temp < 10) return 'ALTA';
    return 'CRÍTICA';
  };

  // Calcular tiempo de funcionamiento basado en entry_id
  const calculateUptime = () => {
    if (!thingSpeakData?.entry_id) return 'N/A';
    
    // Cada entrada representa aproximadamente 1 minuto
    const totalMinutes = thingSpeakData.entry_id;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h ${minutes}m`;
    }
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-blue-50">
      {/* Header */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-r from-blue-800 to-indigo-900 shadow-xl border-b border-blue-700 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-0 right-0 bg-white opacity-5 w-96 h-96 rounded-full -mr-20 -mt-20"></div>
          <div className="absolute bottom-0 left-0 bg-white opacity-5 w-64 h-64 rounded-full -ml-10 -mb-10"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center">
              <motion.div 
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 5 }}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 p-3 rounded-full mr-4 shadow-lg border-2 border-white/20"
              >
                <div className="relative">
                  <Snowflake className="h-8 w-8 text-white" />
                  <Thermometer className="h-5 w-5 text-white absolute -bottom-1 -right-1" />
                </div>
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-wide">Frio Rico Cajamarca</h1>
                <div className="flex items-center">
                  <p className="text-blue-200 text-sm mr-2">Sistema de Monitoreo de Cadena de Frío</p>
                  <span className="px-2 py-0.5 bg-blue-500/30 rounded-full text-xs text-white border border-blue-400/30">v2.1</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="flex items-center space-x-2 bg-white/10 px-3 py-1.5 rounded-full"
              >
                <motion.div 
                  animate={{
                    scale: connectionStatus === 'connected' ? [1, 1.2, 1] : 1,
                    backgroundColor: connectionStatus === 'connected' 
                      ? '#4ade80' // verde brillante cuando conectado
                      : connectionStatus === 'connecting' 
                        ? '#fbbf24' // amarillo cuando reconectando
                        : '#f87171' // rojo cuando desconectado
                  }}
                  transition={{
                    scale: { repeat: connectionStatus === 'connected' ? Infinity : 0, duration: 2 },
                    backgroundColor: { duration: 0.3 }
                  }}
                  className="w-3 h-3 rounded-full"
                ></motion.div>
                <span className="text-sm text-white">
                  {connectionStatus === 'connected' 
                    ? 'Conectado' 
                    : connectionStatus === 'connecting' 
                      ? 'Reconectando...' 
                      : 'Desconectado'}
                </span>
              </motion.div>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onLogout}
                className="flex items-center px-4 py-2 text-sm text-white bg-gradient-to-r from-blue-600/40 to-indigo-700/40 hover:from-blue-600/60 hover:to-indigo-700/60 rounded-full transition-all duration-300 border border-white/10 shadow-lg relative overflow-hidden group"
              >
                <span className="absolute right-0 top-0 h-full w-12 translate-x-12 transform bg-white opacity-10 transition-all duration-1000 group-hover:-translate-x-40"></span>
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesión
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Panel Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Métricas Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Temperatura</p>
                    <motion.p 
                      key={sensorData.temperature}
                      initial={{ scale: 1.1 }}
                      animate={{ scale: 1 }}
                      className={`text-4xl font-bold ${getTemperatureColor(sensorData.temperature)}`}
                    >
                      {sensorData.temperature.toFixed(1)}°C
                    </motion.p>
                    <motion.div 
                      className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${sensorData.temperature >= sensorData.tempMin && sensorData.temperature <= sensorData.tempMax ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {getTemperatureStatus(sensorData.temperature)}
                    </motion.div>
                  </div>
                  <motion.div 
                    whileHover={{ rotate: 20, scale: 1.1 }}
                    className="p-4 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full shadow-lg"
                  >
                    <div className="relative">
                      <Thermometer className="h-8 w-8 text-white" />
                      <div className="absolute -top-1 -right-1 bg-blue-400 rounded-full p-1 shadow-sm">
                        <Snowflake className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Humedad</p>
                    <motion.p 
                      key={sensorData.humidity}
                      initial={{ scale: 1.1 }}
                      animate={{ scale: 1 }}
                      className="text-4xl font-bold text-blue-600"
                    >
                      {sensorData.humidity.toFixed(1)}%
                    </motion.p>
                    <motion.div className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Relativa
                    </motion.div>
                  </div>
                  <motion.div 
                    whileHover={{ rotate: 20, scale: 1.1 }}
                    className="p-4 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full shadow-md"
                  >
                    <Droplets className="h-8 w-8 text-white" />
                  </motion.div>
                </div>
              </motion.div>
            </div>

            {/* Rango de Temperaturas */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Rangos de Temperatura</h3>
                <motion.div 
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 10 }}
                >
                  <RefreshCw className="h-5 w-5 text-blue-500" />
                </motion.div>
              </div>
              
              {/* Rangos del Día */}
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                  Rangos del Día
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <motion.div 
                    whileHover={{ scale: 1.03 }}
                    className="flex justify-between items-center p-4 bg-blue-50 border border-blue-100 rounded-lg shadow-sm"
                  >
                    <div className="flex items-center">
                      <div className="p-2 bg-blue-100 rounded-full mr-3">
                        <Thermometer className="h-5 w-5 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Mínima del Día</span>
                    </div>
                    <motion.span 
                      key={thingSpeakData?.temp_min_dia || sensorData.tempMinDay}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="font-bold text-blue-600 text-lg"
                    >
                      {(thingSpeakData?.temp_min_dia !== undefined && thingSpeakData?.temp_min_dia !== null) ? 
                        `${thingSpeakData.temp_min_dia.toFixed(1)}°C` : 
                        (sensorData.tempMinDay !== undefined && sensorData.tempMinDay !== null) ?
                        `${sensorData.tempMinDay.toFixed(1)}°C` :
                        <span className="text-gray-400 text-sm flex items-center">
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Esperando
                        </span>
                      }
                    </motion.span>
                  </motion.div>
                  
                  <motion.div 
                    whileHover={{ scale: 1.03 }}
                    className="flex justify-between items-center p-4 bg-red-50 border border-red-100 rounded-lg shadow-sm"
                  >
                    <div className="flex items-center">
                      <div className="p-2 bg-red-100 rounded-full mr-3">
                        <Thermometer className="h-5 w-5 text-red-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Máxima del Día</span>
                    </div>
                    <motion.span 
                      key={thingSpeakData?.temp_max_dia || sensorData.tempMaxDay}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="font-bold text-red-600 text-lg"
                    >
                      {(thingSpeakData?.temp_max_dia !== undefined && thingSpeakData?.temp_max_dia !== null) ? 
                        `${thingSpeakData.temp_max_dia.toFixed(1)}°C` : 
                        (sensorData.tempMaxDay !== undefined && sensorData.tempMaxDay !== null) ?
                        `${sensorData.tempMaxDay.toFixed(1)}°C` :
                        <span className="text-gray-400 text-sm flex items-center">
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Esperando
                        </span>
                      }
                    </motion.span>
                  </motion.div>
                </div>
              </div>
              
              {/* Límites Configurados */}
              <div>
                <h4 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                  <Target className="h-4 w-4 mr-2 text-green-600" />
                  Límites Configurados
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <motion.div 
                    whileHover={{ scale: 1.03 }}
                    className="flex justify-between items-center p-4 bg-green-50 border border-green-100 rounded-lg shadow-sm"
                  >
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-full mr-3">
                        <Thermometer className="h-5 w-5 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Límite Mínimo</span>
                    </div>
                    <motion.span 
                      key={sensorData.tempMin}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="font-bold text-green-600 text-lg"
                    >
                      {sensorData.tempMin !== undefined && sensorData.tempMin !== null ? 
                        `${sensorData.tempMin.toFixed(1)}°C` : 'N/A'}
                    </motion.span>
                  </motion.div>
                  
                  <motion.div 
                    whileHover={{ scale: 1.03 }}
                    className="flex justify-between items-center p-4 bg-green-50 border border-green-100 rounded-lg shadow-sm"
                  >
                    <div className="flex items-center">
                      <div className="p-2 bg-green-100 rounded-full mr-3">
                        <Thermometer className="h-5 w-5 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">Límite Máximo</span>
                    </div>
                    <motion.span 
                      key={sensorData.tempMax}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="font-bold text-green-600 text-lg"
                    >
                      {sensorData.tempMax !== undefined && sensorData.tempMax !== null ? 
                        `${sensorData.tempMax.toFixed(1)}°C` : 'N/A'}
                    </motion.span>
                  </motion.div>
                </div>
              </div>
            </motion.div>

            {/* Estadísticas de ThingSpeak */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <Database className="h-6 w-6 text-blue-400" />
                  <h2 className="text-xl font-semibold text-gray-900">Estadísticas del Sistema (ThingSpeak)</h2>
                </div>
                <div className="text-sm text-blue-600">
                  {lastThingSpeakUpdate ? (
                    `Última actualización: ${lastThingSpeakUpdate.toLocaleTimeString()}`
                  ) : (
                    'Cargando datos...'
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Rangos de temperatura del día */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-4 border border-orange-200">
                  <div className="flex items-center justify-between mb-2">
                    <Target className="h-5 w-5 text-orange-600" />
                    <span className="text-xs text-orange-600">Rangos Diarios</span>
                  </div>
                  <div className="text-gray-900">
                    <div className="text-lg font-bold">
                      {thingSpeakData ? `${thingSpeakData.temp_min_dia.toFixed(1)}°C - ${thingSpeakData.temp_max_dia.toFixed(1)}°C` : 'N/A'}
                    </div>
                    <div className="text-xs text-orange-600">Min - Max del día</div>
                  </div>
                </div>

                {/* Total de lecturas (basado en entry_id) */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <Database className="h-5 w-5 text-green-600" />
                    <span className="text-xs text-green-600">Total Lecturas</span>
                  </div>
                  <div className="text-gray-900">
                    <div className="text-2xl font-bold">
                      {thingSpeakData?.entry_id || 0}
                    </div>
                    <div className="text-xs text-green-600">Registros enviados</div>
                  </div>
                </div>

                {/* Tiempo de funcionamiento */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <Timer className="h-5 w-5 text-purple-600" />
                    <span className="text-xs text-purple-600">Tiempo Activo</span>
                  </div>
                  <div className="text-gray-900">
                    <div className="text-lg font-bold">
                      {calculateUptime()}
                    </div>
                    <div className="text-xs text-purple-600">Funcionamiento</div>
                  </div>
                </div>

                {/* Estado del display */}
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-4 border border-cyan-200">
                  <div className="flex items-center justify-between mb-2">
                    <Activity className="h-5 w-5 text-cyan-600" />
                    <span className="text-xs text-cyan-600">Estado Display</span>
                  </div>
                  <div className="text-gray-900">
                    <div className="text-lg font-bold">
                      {/* Mostrar datos de ThingSpeak si están disponibles, sino usar datos MQTT */}
                      {thingSpeakData?.display_disponible ? 'Activo' : 'Error'}
                    </div>
                    <div className="text-xs text-cyan-600">
                      {/* Mostrar datos de ThingSpeak si están disponibles, sino usar datos MQTT */}
                      {thingSpeakData?.display_disponible ? 'SPI Funcionando' : 'Verificar conexión'}
                      {thingSpeakData ? ' (ThingSpeak)' : ' (Sin datos)'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Información adicional */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                    Última Lectura ThingSpeak
                  </h3>
                  <p className="text-blue-600 text-sm">
                    {thingSpeakData?.created_at ? 
                      thingSpeakData.created_at.toLocaleString('es-PE', {
                        timeZone: 'America/Lima',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 'No disponible'
                    }
                  </p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                    <Database className="h-4 w-4 mr-2 text-green-600" />
                    Canal ThingSpeak
                  </h3>
                  <p className="text-green-600 text-sm">
                    Canal ID: {import.meta.env.VITE_THINGSPEAK_CHANNEL_ID || 'No configurado'}<br />
                    Frecuencia: ~1 minuto
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Controles */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Controles del Sistema</h3>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Settings className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRelayToggle}
                  className={`flex items-center justify-center p-4 rounded-lg shadow-md transition-all ${
                    relayState 
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' 
                      : 'bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700'
                  }`}
                >
                  <motion.div
                    animate={{ rotate: relayState ? [0, 10, -10, 10, -10, 0] : 0 }}
                    transition={{ duration: 0.5, repeat: relayState ? Infinity : 0, repeatDelay: 2 }}
                  >
                    <Power className="h-6 w-6 mr-2" />
                  </motion.div>
                  Relay {relayState ? 'ON' : 'OFF'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBuzzerToggle}
                  className={`flex items-center justify-center p-4 rounded-lg shadow-md transition-all ${
                    buzzerState 
                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white' 
                      : 'bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700'
                  }`}
                >
                  <motion.div
                    animate={{ scale: buzzerState ? [1, 1.2, 1] : 1 }}
                    transition={{ duration: 0.3, repeat: buzzerState ? Infinity : 0, repeatDelay: 0.5 }}
                  >
                    <Speaker className="h-6 w-6 mr-2" />
                  </motion.div>
                  Buzzer {buzzerState ? 'ON' : 'OFF'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLedToggle}
                  className={`flex items-center justify-center p-4 rounded-lg shadow-md transition-all ${
                    ledState 
                      ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' 
                      : 'bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700'
                  }`}
                >
                  <motion.div
                    animate={{ opacity: ledState ? [1, 0.5, 1] : 1 }}
                    transition={{ duration: 1, repeat: ledState ? Infinity : 0 }}
                  >
                    <Lightbulb className="h-6 w-6 mr-2" />
                  </motion.div>
                  LED {ledState ? 'ON' : 'OFF'}
                </motion.button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBuzzerBeep}
                  className="flex items-center justify-center p-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg shadow-md transition-all"
                >
                  <Speaker className="h-5 w-5 mr-2" />
                  Beep de Prueba
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSystemToggle}
                  className={`flex items-center justify-center p-3 rounded-lg shadow-md transition-all ${
                    sensorData.systemEnabled
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                      : 'bg-gradient-to-r from-green-500 to-green-600 text-white'
                  }`}
                >
                  <Settings className="h-5 w-5 mr-2" />
                  {sensorData.systemEnabled ? 'Deshabilitar' : 'Habilitar'} Sistema
                </motion.button>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDisplayReset}
                  className="flex items-center justify-center p-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg shadow-md transition-all"
                >
                  <Activity className="h-5 w-5 mr-2" />
                  Reiniciar Display
                </motion.button>
              </div>
            </motion.div>

            {/* Configuración de Límites de Temperatura */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Configurar Límites de Temperatura</h3>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Settings className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <Thermometer className="h-4 w-4 text-blue-500 mr-2" />
                    Temperatura Mínima (°C)
                  </label>
                  <motion.div whileHover={{ scale: 1.02 }} className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={newTempMin}
                      onChange={(e) => setNewTempMin(e.target.value)}
                      className="w-full px-3 py-3 border border-blue-200 bg-blue-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-blue-500 font-semibold">
                      °C
                    </div>
                  </motion.div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <Thermometer className="h-4 w-4 text-red-500 mr-2" />
                    Temperatura Máxima (°C)
                  </label>
                  <motion.div whileHover={{ scale: 1.02 }} className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={newTempMax}
                      onChange={(e) => setNewTempMax(e.target.value)}
                      className="w-full px-3 py-3 border border-red-200 bg-red-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent shadow-sm"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-red-500 font-semibold">
                      °C
                    </div>
                  </motion.div>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleUpdateLimits}
                  className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center"
                >
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Actualizar Límites
                </motion.button>
              </div>
              

            </motion.div>
          </div>

          {/* Panel Lateral */}
          <div className="space-y-6">
            {/* Estado del Sistema */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Estado del Sistema</h3>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              
              <div className="space-y-4">
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center">
                    <div className="p-1.5 bg-gray-200 rounded-full mr-3">
                      <Power className="h-4 w-4 text-gray-700" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Sistema habilitado</span>
                  </div>
                  <motion.div
                    animate={sensorData.systemEnabled ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {sensorData.systemEnabled ? (
                      <div className="p-1 bg-green-100 rounded-full">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                    ) : (
                      <div className="p-1 bg-red-100 rounded-full">
                        <XCircle className="h-5 w-5 text-red-500" />
                      </div>
                    )}
                  </motion.div>
                </motion.div>
                
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center">
                    <div className="p-1.5 bg-gray-200 rounded-full mr-3">
                      <AlertTriangle className="h-4 w-4 text-gray-700" />
                    </div>
                    <span className="text-sm font-medium text-gray-700">Alerta activa</span>
                  </div>
                  <motion.div
                    animate={sensorData.alertActive ? { rotate: [0, 10, -10, 10, -10, 0] } : { rotate: 0 }}
                    transition={{ duration: 0.5, repeat: sensorData.alertActive ? Infinity : 0, repeatDelay: 1 }}
                  >
                    {sensorData.alertActive ? (
                      <div className="p-1 bg-red-100 rounded-full">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                      </div>
                    ) : (
                      <div className="p-1 bg-green-100 rounded-full">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      </div>
                    )}
                  </motion.div>
                </motion.div>
                
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center">
                    <div className="p-1.5 bg-gray-200 rounded-full mr-3">
                      <svg className="h-4 w-4 text-gray-700" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.5 12.5L5 16H19L15.5 12.5M8.5 11.5L5 8H19L15.5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">WiFi ESP32</span>
                  </div>
                  {/* Si hay conexión MQTT activa, asumir que WiFi también está conectado */}
                  {(sensorData.wifiConnected || connectionStatus === 'connected') ? (
                    <div className="p-1 bg-green-100 rounded-full">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                  ) : (
                    <div className="p-1 bg-red-100 rounded-full">
                      <XCircle className="h-5 w-5 text-red-500" />
                    </div>
                  )}
                </motion.div>
                
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center">
                    <div className="p-1.5 bg-gray-200 rounded-full mr-3">
                      <svg className="h-4 w-4 text-gray-700" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4L4 8L12 12L20 8L12 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4 12L12 16L20 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4 16L12 20L20 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700">MQTT ESP32</span>
                  </div>
                  {/* Si hay conexión MQTT activa, mostrar como conectado */}
                  {(sensorData.mqttConnected || connectionStatus === 'connected') ? (
                    <div className="p-1 bg-green-100 rounded-full">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                  ) : (
                    <div className="p-1 bg-red-100 rounded-full">
                      <XCircle className="h-5 w-5 text-red-500" />
                    </div>
                  )}
                </motion.div>
              </div>
              

              

            </motion.div>

            {/* Consola de Eventos */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white rounded-xl shadow-lg p-6 border border-blue-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Consola de Eventos</h3>
                <div className="p-2 bg-blue-100 rounded-full">
                  <Terminal className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              
              <AnimatePresence>
                <motion.div 
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: 1 }}
                  className="h-96 overflow-y-auto bg-gray-900 rounded-lg p-4 shadow-inner"
                >
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <motion.div 
                        key={log.id} 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-start space-x-2 text-sm"
                      >
                        <span className="text-gray-400 font-mono">{log.timestamp}</span>
                        <span className={`font-mono ${
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'warning' ? 'text-yellow-400' :
                          log.type === 'success' ? 'text-green-400' :
                          'text-blue-400'
                        }`}>
                          [{log.type.toUpperCase()}]
                        </span>
                        <span className="text-gray-300 font-mono break-words">{log.message}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
              
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setLogs([])}
                className="w-full mt-6 px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center relative overflow-hidden group"
              >
                <span className="absolute top-0 left-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></span>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="mr-2"
                >
                  <Trash2 className="h-4 w-4" />
                </motion.div>
                Limpiar Consola
              </motion.button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
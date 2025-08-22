# Dashboard de Monitoreo de Cadena de Frío

Este proyecto es un dashboard web para monitorear sistemas de cadena de frío utilizando React, TypeScript y comunicación MQTT.

## Configuración de Variables de Entorno

Antes de ejecutar la aplicación, debes configurar las variables de entorno. Copia el archivo `.env.example` a `.env` y configura los valores según tu entorno:

```bash
cp .env.example .env
```

### Variables Requeridas

#### Configuración de ThingSpeak
- `VITE_THINGSPEAK_API_KEY`: Tu clave API de ThingSpeak
- `VITE_THINGSPEAK_CHANNEL_ID`: ID del canal de ThingSpeak

#### Credenciales de Administrador
- `VITE_ADMIN_USERNAME`: Nombre de usuario para acceder al dashboard
- `VITE_ADMIN_PASSWORD`: Contraseña para acceder al dashboard

#### Configuración MQTT
- `VITE_MQTT_BROKER_URL`: URL del broker MQTT (ej: ws://localhost:8080/mqtt)
- `VITE_MQTT_USERNAME`: Usuario para conectar al broker MQTT
- `VITE_MQTT_PASSWORD`: Contraseña para conectar al broker MQTT
- `VITE_MQTT_KEEPALIVE`: Tiempo de keepalive en segundos (por defecto: 60)

#### Tópicos MQTT
- `VITE_MQTT_TOPIC_PREFIX`: Prefijo base para todos los tópicos (por defecto: cadena-frio)
- `VITE_MQTT_TOPIC_TEMPERATURA`: Tópico para datos de temperatura
- `VITE_MQTT_TOPIC_HUMEDAD`: Tópico para datos de humedad
- `VITE_MQTT_TOPIC_ESTADO`: Tópico para estado del sistema
- `VITE_MQTT_TOPIC_CONTROL_SISTEMA`: Tópico para control del sistema
- `VITE_MQTT_TOPIC_CONTROL_RELAY`: Tópico para control del relay
- `VITE_MQTT_TOPIC_CONTROL_BUZZER`: Tópico para control del buzzer
- `VITE_MQTT_TOPIC_CONTROL_LED`: Tópico para control del LED
- `VITE_MQTT_TOPIC_CONTROL_LIMITES`: Tópico para configurar límites de temperatura

#### Configuración de la Aplicación
- `VITE_APP_NAME`: Nombre de la aplicación
- `VITE_APP_VERSION`: Versión de la aplicación
- `VITE_COMPANY_NAME`: Nombre de la empresa
- `VITE_THINGSPEAK_UPDATE_INTERVAL`: Intervalo de actualización en milisegundos (por defecto: 120000)

## Instalación y Ejecución

1. Instala las dependencias:
```bash
npm install
```

2. Configura las variables de entorno en el archivo `.env`

3. Ejecuta la aplicación en modo desarrollo:
```bash
npm run dev
```

4. Construye la aplicación para producción:
```bash
npm run build
```

## Seguridad

⚠️ **IMPORTANTE**: 
- Nunca subas el archivo `.env` a tu repositorio de GitHub
- El archivo `.env` está incluido en `.gitignore` para evitar que se suba accidentalmente
- Usa valores seguros para las credenciales de administrador
- Cambia las credenciales por defecto antes de desplegar en producción

## Estructura del Proyecto

- `src/components/Dashboard.tsx`: Componente principal del dashboard
- `src/components/LoginScreen.tsx`: Pantalla de inicio de sesión
- `src/App.tsx`: Componente raíz de la aplicación
- `.env.example`: Archivo de ejemplo con todas las variables de entorno
- `.env`: Archivo de configuración local (no incluido en el repositorio)
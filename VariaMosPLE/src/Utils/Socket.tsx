import io from 'socket.io-client';

// Solo necesitas configurar la conexión una vez
const socket = io('http://200.13.4.230:4000');

// Exportar la misma instancia para ser usada en cualquier parte de la aplicación
export default socket;
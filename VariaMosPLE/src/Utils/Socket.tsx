import io from 'socket.io-client';

// Solo necesitas configurar la conexión una vez
const socket = io('http://localhost:4000');

// Exportar la misma instancia para ser usada en cualquier parte de la aplicación
export default socket;
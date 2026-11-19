// Entry for the diagnostic build (APP_ENTRY=diag/index.js). Not used by the real app.
import { registerRootComponent } from 'expo';
import DiagApp from './DiagApp';

registerRootComponent(DiagApp);

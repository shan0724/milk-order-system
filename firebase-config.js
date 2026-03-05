/**
 * Firebase 設定與初始化
 * 雲端叫貨紀錄共用儲存
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
    getDatabase, ref, push, onValue, remove, get,
    query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyA03093RQCPs9PpP-ywF0Lfr3BLOPDYgqQ",
    authDomain: "milk-89842.firebaseapp.com",
    projectId: "milk-89842",
    storageBucket: "milk-89842.firebasestorage.app",
    messagingSenderId: "921065357363",
    appId: "1:921065357363:web:7244cd8c259c5ae67aa346",
    // Realtime Database URL — asia-southeast1 (新加坡)
    databaseURL: "https://milk-89842-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, push, onValue, remove, get, query, orderByChild, limitToLast };

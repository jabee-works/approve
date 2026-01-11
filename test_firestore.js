const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function test() {
    console.log("Writing test doc...");
    try {
        const res = await db.collection('tasks').add({
            title: "Test Task from Mac",
            status: "下書き",
            createdAt: new Date()
        });
        console.log("Document written with ID: ", res.id);
    } catch (e) {
        console.error("Error writing document: ", e);
    }
}

test();

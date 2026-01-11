const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function deleteStarlight() {
    console.log("Searching for 'Starlight Breaker'...");
    const snapshot = await db.collection('tasks').where('title', '==', 'Starlight Breaker (スターライトブレイカー)').get();

    if (snapshot.empty) {
        console.log("No matching documents found.");
        return;
    }

    const batch = db.batch();
    snapshot.forEach(doc => {
        console.log(`Deleting: ${doc.id} - ${doc.data().title}`);
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log("Deleted.");
}

deleteStarlight();

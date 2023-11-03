import fetch, { FormData, fileFrom } from 'node-fetch';
import { createRequire } from "module";

//mollyes variables
let yes_String = "Votes for yes, she was committed: ";
let no_String = "Votes for no, she was not committed: ";
let speechify_String = "";

let outputPath = "";

let setup_sheetID = "1Hpq1SvT1u0A-fz2Th7tvFN8M_3z4T3FSa0a_kdkNGQM";
let yes_sheetID = "";
let no_sheetID = "";

let yes_cellCount = 1;
let no_cellCount = 1;

//needed to run
const require = createRequire(import.meta.url);

//speechify auth
const API_KEY = 'hfZsWNToSDmwALSiip9PeLtBLAxwfqz6 ' // YOUR API KEY HERE
const BASE = 'https://myvoice.speechify.com/api'
//google sheets auth
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCredentials(client);
    }
    return client;
}

/**
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
async function getFeedback(auth) {
    const sheets = google.sheets({ version: 'v4', auth });
    const setupSheet = await sheets.spreadsheets.values.get({
        spreadsheetId: setup_sheetID,
        range: 'Sheet1!B:B',
    });
    //assign the yes and no sheets to B1 and B2 set up sheet values
    yes_sheetID = setupSheet.data.values[0];
    no_sheetID = setupSheet.data.values[1];
    outputPath = setupSheet.data.values[5].toString();
    //assign the yes and no counter vals to B4 and B5 set up sheet values
    yes_cellCount = setupSheet.data.values[3];
    no_cellCount = setupSheet.data.values[4];
    const yesSheet = await sheets.spreadsheets.values.get({
        spreadsheetId: yes_sheetID,
        range: 'Sheet1!B' + yes_cellCount + ':B',
    });
    const yesRows = yesSheet.data.values;
    if (!yesRows || yesRows.length === 0) {
        console.log('No data found.');
        return;
    }
    console.log("setup sheet id: " + setup_sheetID);
    console.log("yes sheet id: " + yes_sheetID);
    console.log("no sheet id: " + no_sheetID);
    console.log('Yes Answers');
    yesRows.forEach((row) => {
        yes_String += `${row[0]}, `;
        yes_cellCount++;
    });
    console.log(yes_String);
    const noSheet = await sheets.spreadsheets.values.get({
        spreadsheetId: no_sheetID,
        range: 'Sheet1!B' + no_cellCount + ':B',
    });
    const noRows = noSheet.data.values;
    if (!noRows || noRows.length === 0) {
        console.log('No data found.');
        return;
    }
    console.log('No Answers');
    noRows.forEach((row) => {
        no_String += `${row[0]}, `;
        no_cellCount++;
    });
    console.log(no_String);
    speechify_String = yes_String + ". " + no_String;
    await sheets.spreadsheets.values.update({
        auth: auth,
        spreadsheetId: setup_sheetID,
        range: "B4:B5",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[yes_cellCount], [no_cellCount]] },
    });

}

authorize().then(getFeedback).catch(console.error);

async function clone_voice() {
    const url = BASE + '/voice';

    const form = new FormData();

    form.append('name', 'kate_testing');
    form.append('files', await fileFrom('audio/kate.m4a', 'audio/wav'));

    const headers = {
        'accept': 'application/json',
        'x-api-key': API_KEY,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: form,
    });

    const voice = await response.json();
    console.log(voice)
    return voice
}


async function tts(voice) {
    const url_0 = BASE + '/tts/clone';

    const form = new FormData();
    form.append('text', speechify_String);
    form.append('voice_id', voice.id);
    form.append('stability', '0.75');
    form.append('clarity', '0.75');

    const headers = {
        'accept': 'application/json',
        'x-api-key': API_KEY,
    };

    const response = await fetch(url_0, {
        method: 'POST',
        headers: headers,
        body: form,
    });

    const result = await response.json();
    const mp3_url = result.url;
    const http = require('https'); // or 'https' for https:// URLs
    const fs = require('fs');

    const file = fs.createWriteStream(outputPath);
    const request = http.get(mp3_url, function (response) {
        response.pipe(file);

        // after download completed close filestreams
        file.on("finish", () => {
            file.close();
            console.log("Download Completed");
        });
    });
    console.log(result);
    console.log(mp3_url);
    return result
}

const main = async () => {
    const voice = await clone_voice();
    await tts(voice);
}

main()
import fetch, { FormData, fileFrom } from 'node-fetch';
import https from 'https';
import { google } from 'googleapis';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { createRequire } from 'module';
import path from 'path';
import process from 'process';
// import { promises as fs } from 'fs';

import fs from 'fs';
const fsp = fs.promises;

import pkg from 'google-auth-library';
const { authenticate } = pkg;

// Setting path for ffmpeg to work with fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path);

// Your Speechify API Key
const API_KEY = 'hfZsWNToSDmwALSiip9PeLtBLAxwfqz6'; // Replace with your actual API key
const BASE = 'https://myvoice.speechify.com/api';

// Google Sheets and Drive API configuration
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Your variables
let yes_String = "Votes for yes, she was committed: ";
let no_String = "Votes for no, she was not committed: ";
let speechify_String = "";
let outputPath = "";
let setup_sheetID = "1Hpq1SvT1u0A-fz2Th7tvFN8M_3z4T3FSa0a_kdkNGQM";
let yes_sheetID = "";
let no_sheetID = "";
let yes_cellCount = 1;
let no_cellCount = 1;

// Needed to use require in ES6 module
const require = createRequire(import.meta.url);

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fsp.readFile(TOKEN_PATH); // Updated to use fsp
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
    const content = await fsp.readFile(CREDENTIALS_PATH); // Updated to use fsp
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fsp.writeFile(TOKEN_PATH, payload); // Updated to use fsp
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
    //assign file path
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

function splitIntoChunks(text, chunkSize) {
    const chunks = [];
  
    while (text.length > 0) {
      let endIndex = chunkSize;
      if (text.length > chunkSize) {
        while (text[endIndex] !== ' ' && endIndex > 0) {
          endIndex--;
        }
      }
      chunks.push(text.substring(0, endIndex).trim());
      text = text.substring(endIndex).trim();
    }
  
    return chunks;
  }
  
  async function downloadAudio(url, path) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(path);
      https.get(url, (response) => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(path, () => {}); // Delete the file async. Ignore error.
        reject(err);
      });
    });
  }
  
  function concatenateAudio(files, outputPath) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
  
      files.forEach(file => {
        command.input(file);
      });
  
      command
        .on('error', (err) => {
          reject(err);
        })
        .on('end', () => {
          resolve(outputPath);
        })
        .mergeToFile(outputPath, './temp_directory');
    });
  }

  async function tts(voice, textChunk) {
    const url = BASE + '/tts/clone';
    const form = new FormData();
    form.append('text', textChunk);
    form.append('voice_id', voice.id);
    form.append('stability', '0.75');
    form.append('clarity', '0.75');

    const headers = {
        'accept': 'application/json',
        'x-api-key': API_KEY,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: form,
    });

    const result = await response.json();
    return result;
}

const main = async () => {
  const voice = await clone_voice();
  const chunks = splitIntoChunks(speechify_String, 2000); // Change the chunk size if needed
  const audioFiles = [];

  for (const chunk of chunks) {
    const ttsResult = await tts(voice, chunk);
    const audioPath = `audio_chunk_${chunks.indexOf(chunk)}.mp3`;
    await downloadAudio(ttsResult.url, audioPath);
    audioFiles.push(audioPath);
  }

  // Check if the audio files are accessible and log them
  console.log('Audio files to be concatenated:', audioFiles);
  for (const file of audioFiles) {
    try {
      await fsp.access(file, fs.constants.R_OK);
      console.log(`File ${file} is readable.`);
    } catch (err) {
      console.error(`Error accessing file ${file}:`, err.message);
    }
  }

  // Define the final output path using the outputPath variable from the spreadsheet
  const finalOutputPath = path.join(outputPath, 'feedback.mp3');

  // Proceed with concatenation if all files are readable
  try {
    await concatenateAudio(audioFiles, finalOutputPath);
    console.log(`Concatenated audio available at: ${finalOutputPath}`);
  } catch (error) {
    console.error('An error occurred during concatenation:', error);
  }

  // Cleanup
  for (const file of audioFiles) {
      try {
        await fsp.unlink(file); // Updated to use fsp
        console.log(`Deleted file: ${file}`);
      } catch (err) {
        console.error(`Error deleting file ${file}:`, err.message);
      }
  }
};

main().catch(console.error);
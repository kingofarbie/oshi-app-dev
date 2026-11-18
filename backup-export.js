
/* =====================================================
   💾 バックアップファイル出力
   backup-export.js

   ・選択済みデータをZIP形式にする
   ・JSONデータと写真・動画をまとめる
   ・写真・動画は無圧縮で格納する
   ・既存の保存データは変更しない
===================================================== */

(function(){

"use strict";


/* =====================================================
   1. CRC32 テーブル
===================================================== */

const CRC_TABLE = new Uint32Array(256);

for(let n = 0; n < 256; n++){

    let c = n;

    for(let k = 0; k < 8; k++){

        c = (c & 1)
            ? 0xEDB88320 ^ (c >>> 1)
            : c >>> 1;

    }

    CRC_TABLE[n] = c >>> 0;

}


/* =====================================================
   2. Blob の CRC32 計算
===================================================== */

async function calculateCRC32(blob){

    let crc = 0xFFFFFFFF;

    function update(bytes){

        for(let i = 0; i < bytes.length; i++){

            crc =
                CRC_TABLE[
                    (crc ^ bytes[i]) & 0xFF
                ] ^ (crc >>> 8);

        }

    }

    if(blob.stream){

        const reader = blob.stream().getReader();

        while(true){

            const {done,value} = await reader.read();

            if(done) break;

            update(value);

        }

    }else{

        update(new Uint8Array(await blob.arrayBuffer()));

    }

    return (crc ^ 0xFFFFFFFF) >>> 0;

}


/* =====================================================
   3. ZIP用ヘッダー作成
===================================================== */

const encoder = new TextEncoder();


function makeLocalHeader(entry){

    const name = encoder.encode(entry.name);

    const header = new Uint8Array(30 + name.length);

    const view = new DataView(header.buffer);

    view.setUint32(0,0x04034B50,true);
    view.setUint16(4,20,true);
    view.setUint16(6,0x0800,true);
    view.setUint16(8,0,true);
    view.setUint16(10,entry.time,true);
    view.setUint16(12,entry.date,true);
    view.setUint32(14,entry.crc,true);
    view.setUint32(18,entry.size,true);
    view.setUint32(22,entry.size,true);
    view.setUint16(26,name.length,true);
    view.setUint16(28,0,true);

    header.set(name,30);

    return header;

}


function makeCentralHeader(entry){

    const name = encoder.encode(entry.name);

    const header = new Uint8Array(46 + name.length);

    const view = new DataView(header.buffer);

    view.setUint32(0,0x02014B50,true);
    view.setUint16(4,20,true);
    view.setUint16(6,20,true);
    view.setUint16(8,0x0800,true);
    view.setUint16(10,0,true);
    view.setUint16(12,entry.time,true);
    view.setUint16(14,entry.date,true);
    view.setUint32(16,entry.crc,true);
    view.setUint32(20,entry.size,true);
    view.setUint32(24,entry.size,true);
    view.setUint16(28,name.length,true);
    view.setUint16(30,0,true);
    view.setUint16(32,0,true);
    view.setUint16(34,0,true);
    view.setUint16(36,0,true);
    view.setUint32(38,0,true);
    view.setUint32(42,entry.offset,true);

    header.set(name,46);

    return header;

}


/* =====================================================
   4. ZIPの日付情報
===================================================== */

function getZipDate(){

    const now = new Date();

    return {

        time:
            (now.getHours() << 11) |
            (now.getMinutes() << 5) |
            Math.floor(now.getSeconds() / 2),

        date:
            ((now.getFullYear() - 1980) << 9) |
            ((now.getMonth() + 1) << 5) |
            now.getDate()

    };

}


/* =====================================================
   5. ファイル名の安全化
===================================================== */

function safeFileName(value){

    return String(value || "media")
        .replace(/[^a-zA-Z0-9_.-]/g,"_");

}


function getExtension(file){

    const extensions = {

        "image/jpeg":".jpg",
        "image/png":".png",
        "image/webp":".webp",
        "image/gif":".gif",
        "video/mp4":".mp4",
        "video/webm":".webm",
        "video/quicktime":".mov"

    };

    return extensions[file.type] || ".bin";

}


/* =====================================================
   6. ZIPファイル生成
===================================================== */

async function createZipBlob(backupData){

    if(
        !backupData ||
        backupData.format !== "oshi-app-backup-data"
    ){

        throw new Error(
            "バックアップデータの形式が正しくありません。"
        );

    }

    if(
        !backupData.mainData ||
        !backupData.localStorage ||
        !Array.isArray(backupData.media)
    ){

        throw new Error(
            "バックアップデータの内容が不完全です。"
        );

    }


    const dateInfo = getZipDate();

    const entries = [];


    /* =================================================
       6-1. JSONデータ
    ================================================= */

    const mediaMetadata = [];

    for(let i = 0; i < backupData.media.length; i++){

        const item = backupData.media[i];

        if(!(item.file instanceof Blob)){

            throw new Error(
                "実ファイルが見つからないメディアがあります: " +
                item.id
            );

        }

        const path =
            "media/" +
            safeFileName(item.id) +
            getExtension(item.file);

        const metadata = {};

        for(const key of Object.keys(item)){

            if(key === "file") continue;

            metadata[key] = item[key];

        }

        metadata.backupPath = path;

        mediaMetadata.push(metadata);

        entries.push({

            name:path,

            blob:item.file,

            size:item.file.size,

            type:item.file.type

        });

    }


    const manifest = {

        format:"oshi-app-backup",

        version:1,

        createdAt:backupData.createdAt,

        mainData:backupData.mainData,

        localStorage:backupData.localStorage,

        media:mediaMetadata,

        summary:backupData.summary || {}

    };


    const jsonBlob = new Blob(

        [
            JSON.stringify(manifest,null,2)
        ],

        {
            type:"application/json"
        }

    );


    entries.unshift({

        name:"backup.json",

        blob:jsonBlob,

        size:jsonBlob.size,

        type:"application/json"

    });


    /* =================================================
       6-2. ZIPデータ作成
    ================================================= */

    const zipParts = [];

    const centralParts = [];

    let offset = 0;


    for(const entry of entries){

        if(entry.size > 0xFFFFFFFF){

            throw new Error(
                "4GBを超えるファイルには対応していません。"
            );

        }

        const crc = await calculateCRC32(entry.blob);

        const zipEntry = {

            name:entry.name,

            crc:crc,

            size:entry.size,

            offset:offset,

            time:dateInfo.time,

            date:dateInfo.date

        };


        const localHeader = makeLocalHeader(zipEntry);

        const centralHeader = makeCentralHeader(zipEntry);


        zipParts.push(localHeader);

        zipParts.push(entry.blob);

        centralParts.push(centralHeader);


        offset += localHeader.length + entry.size;

        if(offset > 0xFFFFFFFF){

            throw new Error(
                "バックアップ全体が4GBを超えています。"
            );

        }

    }


    /* =================================================
       6-3. ZIP中央ディレクトリ
    ================================================= */

    const centralOffset = offset;

    let centralSize = 0;

    for(const part of centralParts){

        zipParts.push(part);

        centralSize += part.length;

    }


    if(
        entries.length > 65535 ||
        centralOffset > 0xFFFFFFFF ||
        centralSize > 0xFFFFFFFF
    ){

        throw new Error(
            "ZIP形式の対応上限を超えています。"
        );

    }


    const end = new Uint8Array(22);

    const view = new DataView(end.buffer);

    view.setUint32(0,0x06054B50,true);
    view.setUint16(4,0,true);
    view.setUint16(6,0,true);
    view.setUint16(8,entries.length,true);
    view.setUint16(10,entries.length,true);
    view.setUint32(12,centralSize,true);
    view.setUint32(16,centralOffset,true);
    view.setUint16(20,0,true);

    zipParts.push(end);


    return new Blob(

        zipParts,

        {
            type:"application/zip"
        }

    );

}


/* =====================================================
   7. ZIPファイルのダウンロード
===================================================== */

async function exportZip(backupData){

    const blob = await createZipBlob(backupData);

    const now = new Date();

    const timestamp =

        now.getFullYear() +

        String(now.getMonth() + 1).padStart(2,"0") +

        String(now.getDate()).padStart(2,"0") +

        "-" +

        String(now.getHours()).padStart(2,"0") +

        String(now.getMinutes()).padStart(2,"0") +

        String(now.getSeconds()).padStart(2,"0");


    const filename =
        "oshi-app-backup-" + timestamp + ".zip";


    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(()=>{

        URL.revokeObjectURL(url);

    },60000);


    return {

        filename:filename,

        size:blob.size,

        type:blob.type

    };

}


/* =====================================================
   8. BackupManager へ機能を追加
===================================================== */

if(!window.BackupManager){

    throw new Error(
        "BackupManager が見つかりません。"
    );

}

window.BackupManager.createZipBlob = createZipBlob;

window.BackupManager.exportZip = exportZip;


})();

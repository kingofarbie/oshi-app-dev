
/* =====================================================
   💾 バックアップ復元・読み込み
   backup-restore.js

   第1段階・安全検査強化版

   ・ZIPファイルの読み込み
   ・backup.json の解析
   ・写真・動画の読み込み
   ・ファイルサイズの検証
   ・CRC32による全ファイル検証
   ・ZIPヘッダー情報の照合
   ・メディアIDと保存先の重複検査
   ・余分なファイルの検出
   ・復元内容の確認データ作成

   ※既存データへの書き込みは行わない
   ※上書き・削除・復元は行わない
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
   2. CRC32 計算
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

        try{

            while(true){

                const {done, value} = await reader.read();

                if(done) break;

                update(value);

            }

        }catch(error){

            try{
                await reader.cancel();
            }catch(ignore){}

            throw error;

        }

    }else{

        update(
            new Uint8Array(
                await blob.arrayBuffer()
            )
        );

    }

    return (crc ^ 0xFFFFFFFF) >>> 0;

}


/* =====================================================
   3. ZIP読み込み補助
===================================================== */

const decoder = new TextDecoder("utf-8");


async function readBytes(blob, start, end){

    if(
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        end > blob.size
    ){

        throw new Error(
            "ZIPの読み取り位置が不正です。"
        );

    }

    return new Uint8Array(
        await blob.slice(start, end).arrayBuffer()
    );

}


function makeView(bytes){

    return new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength
    );

}


/* =====================================================
   4. ZIP終了情報の検索
===================================================== */

async function findEndRecord(file){

    const searchSize = Math.min(
        file.size,
        65557
    );

    const start = file.size - searchSize;

    const bytes = await readBytes(
        file,
        start,
        file.size
    );

    const view = makeView(bytes);


    for(let i = bytes.length - 22; i >= 0; i--){

        if(view.getUint32(i, true) !== 0x06054B50){

            continue;

        }

        const commentLength =
            view.getUint16(i + 20, true);


        if(i + 22 + commentLength !== bytes.length){

            continue;

        }


        return {

            offset: start + i,

            diskNumber:
                view.getUint16(i + 4, true),

            centralDisk:
                view.getUint16(i + 6, true),

            diskEntries:
                view.getUint16(i + 8, true),

            totalEntries:
                view.getUint16(i + 10, true),

            centralSize:
                view.getUint32(i + 12, true),

            centralOffset:
                view.getUint32(i + 16, true)

        };

    }


    throw new Error(
        "ZIPの終了情報が見つかりません。"
    );

}


/* =====================================================
   5. ZIP中央ディレクトリの解析
===================================================== */

async function readCentralDirectory(file){

    const end = await findEndRecord(file);


    if(
        end.diskNumber !== 0 ||
        end.centralDisk !== 0 ||
        end.diskEntries !== end.totalEntries
    ){

        throw new Error(
            "分割ZIPには対応していません。"
        );

    }


    if(
        end.totalEntries === 0xFFFF ||
        end.centralOffset === 0xFFFFFFFF ||
        end.centralSize === 0xFFFFFFFF
    ){

        throw new Error(
            "ZIP64形式には対応していません。"
        );

    }


    if(
        end.centralOffset + end.centralSize !== end.offset
    ){

        throw new Error(
            "ZIP中央ディレクトリの位置が不正です。"
        );

    }


    if(
        end.centralOffset + end.centralSize > file.size
    ){

        throw new Error(
            "ZIP中央ディレクトリが範囲外です。"
        );

    }


    const entries = [];

    let offset = end.centralOffset;


    for(let i = 0; i < end.totalEntries; i++){

        const header = await readBytes(
            file,
            offset,
            offset + 46
        );

        if(header.length !== 46){

            throw new Error(
                "ZIP中央ディレクトリが途中で切れています。"
            );

        }


        const view = makeView(header);


        if(view.getUint32(0, true) !== 0x02014B50){

            throw new Error(
                "ZIP中央ディレクトリの形式が不正です。"
            );

        }


        const flags = view.getUint16(8, true);

        const method = view.getUint16(10, true);

        const crc = view.getUint32(16, true);

        const compressedSize = view.getUint32(20, true);

        const size = view.getUint32(24, true);

        const nameLength = view.getUint16(28, true);

        const extraLength = view.getUint16(30, true);

        const commentLength = view.getUint16(32, true);

        const diskStart = view.getUint16(34, true);

        const localOffset = view.getUint32(42, true);


        /*
         * このバックアップ形式は
         * UTF-8・無圧縮方式のみ対応
         */

        if(flags !== 0x0800){

            throw new Error(
                "対応していないZIPフラグがあります。"
            );

        }


        if(method !== 0){

            throw new Error(
                "無圧縮形式以外のZIPには対応していません。"
            );

        }


        if(
            compressedSize !== size ||
            diskStart !== 0
        ){

            throw new Error(
                "ZIP内のファイル情報が不正です。"
            );

        }


        /*
         * 現在のバックアップ出力形式では
         * 追加フィールド・コメントは使用しない
         */

        if(
            extraLength !== 0 ||
            commentLength !== 0
        ){

            throw new Error(
                "未対応のZIP追加情報があります。"
            );

        }


        const nameBytes = await readBytes(
            file,
            offset + 46,
            offset + 46 + nameLength
        );


        const name = decoder.decode(nameBytes);


        if(
            !name ||
            name.startsWith("/") ||
            name.includes("\\") ||
            name.split("/").includes("..") ||
            name.includes("\0")
        ){

            throw new Error(
                "安全でないファイル名が含まれています。"
            );

        }


        if(
            localOffset >= end.centralOffset
        ){

            throw new Error(
                "ZIP内のファイル位置が不正です: " + name
            );

        }


        entries.push({

            name: name,

            flags: flags,

            method: method,

            crc: crc,

            compressedSize: compressedSize,

            size: size,

            localOffset: localOffset

        });


        offset +=
            46 +
            nameLength +
            extraLength +
            commentLength;

    }


    if(
        offset !== end.centralOffset + end.centralSize
    ){

        throw new Error(
            "ZIP中央ディレクトリのサイズが一致しません。"
        );

    }


    return {

        entries: entries,

        centralOffset: end.centralOffset

    };

}


/* =====================================================
   6. ZIP内ファイルの読み取りと検証
===================================================== */

async function readZipEntry(
    file,
    entry,
    centralOffset
){

    const header = await readBytes(
        file,
        entry.localOffset,
        entry.localOffset + 30
    );


    if(header.length !== 30){

        throw new Error(
            "ZIPファイルのヘッダーが不完全です。"
        );

    }


    const view = makeView(header);


    if(view.getUint32(0, true) !== 0x04034B50){

        throw new Error(
            "ZIPファイルのヘッダーが不正です。"
        );

    }


    const flags = view.getUint16(6, true);

    const method = view.getUint16(8, true);

    const localCRC = view.getUint32(14, true);

    const localCompressedSize = view.getUint32(18, true);

    const localSize = view.getUint32(22, true);

    const nameLength = view.getUint16(26, true);

    const extraLength = view.getUint16(28, true);


    if(
        flags !== entry.flags ||
        method !== entry.method
    ){

        throw new Error(
            "ZIPヘッダー情報が一致しません: " +
            entry.name
        );

    }


    /*
     * ローカルヘッダーと中央ディレクトリの
     * サイズ・CRC情報を照合
     */

    if(
        localCRC !== entry.crc ||
        localCompressedSize !== entry.compressedSize ||
        localSize !== entry.size
    ){

        throw new Error(
            "ZIP内のファイル情報が一致しません: " +
            entry.name
        );

    }


    if(extraLength !== 0){

        throw new Error(
            "未対応のZIP追加情報があります: " +
            entry.name
        );

    }


    const nameBytes = await readBytes(
        file,
        entry.localOffset + 30,
        entry.localOffset + 30 + nameLength
    );


    const localName = decoder.decode(nameBytes);


    if(localName !== entry.name){

        throw new Error(
            "ZIP内のファイル名が一致しません。"
        );

    }


    const dataStart =
        entry.localOffset +
        30 +
        nameLength +
        extraLength;


    const dataEnd =
        dataStart +
        entry.compressedSize;


    if(
        dataEnd > file.size ||
        dataEnd > centralOffset
    ){

        throw new Error(
            "ファイルデータがZIPの範囲外です: " +
            entry.name
        );

    }


    const blob = file.slice(
        dataStart,
        dataEnd
    );


    if(blob.size !== entry.size){

        throw new Error(
            "ファイルサイズが一致しません: " +
            entry.name
        );

    }


    const actualCRC = await calculateCRC32(blob);


    if(actualCRC !== entry.crc){

        throw new Error(
            "CRC32が一致しません: " +
            entry.name
        );

    }


    return {

        blob: blob,

        start: entry.localOffset,

        end: dataEnd

    };

}


/* =====================================================
   7. ファイル名関連
===================================================== */

function safeFileName(value){

    return String(value || "media")
        .replace(/[^a-zA-Z0-9_.-]/g, "_");

}


function getExtension(type){

    const extensions = {

        "image/jpeg": ".jpg",

        "image/png": ".png",

        "image/webp": ".webp",

        "image/gif": ".gif",

        "video/mp4": ".mp4",

        "video/webm": ".webm",

        "video/quicktime": ".mov"

    };

    return extensions[type] || ".bin";

}


function getExpectedMediaPath(item){

    return (
        "media/" +
        safeFileName(item.id) +
        getExtension(item.type)
    );

}


/* =====================================================
   8. バックアップJSONの検証
===================================================== */

function validateManifest(manifest){

    if(
        !manifest ||
        manifest.format !== "oshi-app-backup"
    ){

        throw new Error(
            "バックアップファイルの形式が正しくありません。"
        );

    }


    if(manifest.version !== 1){

        throw new Error(
            "対応していないバックアップ形式です。"
        );

    }


    if(
        !manifest.mainData ||
        typeof manifest.mainData !== "object" ||
        Array.isArray(manifest.mainData)
    ){

        throw new Error(
            "メインデータが不正です。"
        );

    }


    if(
        !manifest.localStorage ||
        typeof manifest.localStorage !== "object" ||
        Array.isArray(manifest.localStorage)
    ){

        throw new Error(
            "localStorageデータが不正です。"
        );

    }


    if(!Array.isArray(manifest.media)){

        throw new Error(
            "メディア情報が不正です。"
        );

    }


    /*
     * 不正な特殊キーを拒否
     */

    const forbiddenKeys = [
        "__proto__",
        "prototype",
        "constructor"
    ];


    for(const key of Object.keys(manifest.mainData)){

        if(forbiddenKeys.includes(key)){

            throw new Error(
                "メインデータに不正なキーがあります。"
            );

        }

    }


    for(const key of Object.keys(manifest.localStorage)){

        if(forbiddenKeys.includes(key)){

            throw new Error(
                "localStorageに不正なキーがあります。"
            );

        }

    }


    if(
        manifest.summary !== undefined &&
        (
            !manifest.summary ||
            typeof manifest.summary !== "object" ||
            Array.isArray(manifest.summary)
        )
    ){

        throw new Error(
            "バックアップの概要情報が不正です。"
        );

    }


    const mediaIds = new Set();

    const mediaPaths = new Set();


    for(const item of manifest.media){

        if(
            !item ||
            (
                typeof item.id !== "string" &&
                typeof item.id !== "number"
            ) ||
            String(item.id).length === 0 ||
            typeof item.backupPath !== "string" ||
            !Number.isFinite(item.size) ||
            item.size < 0 ||
            typeof item.type !== "string" ||
            item.type.length === 0
        ){

            throw new Error(
                "メディア情報に不正な項目があります。"
            );

        }


        const idKey = String(item.id);


        if(mediaIds.has(idKey)){

            throw new Error(
                "メディアIDが重複しています: " +
                idKey
            );

        }

        mediaIds.add(idKey);


        if(mediaPaths.has(item.backupPath)){

            throw new Error(
                "メディア保存先が重複しています: " +
                item.backupPath
            );

        }

        mediaPaths.add(item.backupPath);


        const expectedPath =
            getExpectedMediaPath(item);


        if(item.backupPath !== expectedPath){

            throw new Error(
                "メディアIDと保存先の対応が一致しません: " +
                idKey
            );

        }

    }

}


/* =====================================================
   9. ZIPバックアップの読み込み
===================================================== */

async function inspectBackupFile(file){

    if(!(file instanceof Blob)){

        throw new Error(
            "バックアップファイルを指定してください。"
        );

    }


    if(file.size < 22){

        throw new Error(
            "ファイルサイズが小さすぎます。"
        );

    }


    /* ZIP一覧 */

    const zipInfo =
        await readCentralDirectory(file);

    const entries = zipInfo.entries;

    const centralOffset = zipInfo.centralOffset;


    if(entries.length === 0){

        throw new Error(
            "ZIP内にファイルがありません。"
        );

    }


    const entryMap = new Map();


    for(const entry of entries){

        if(entryMap.has(entry.name)){

            throw new Error(
                "ZIP内に重複したファイルがあります: " +
                entry.name
            );

        }

        entryMap.set(entry.name, entry);

    }


    /* =================================================
       ZIP内ファイルの位置重複検査
    ================================================= */

    const ranges = [];


    for(const entry of entries){

        ranges.push({

            start: entry.localOffset,

            end: entry.localOffset + 30

        });

    }


    /*
     * 各ファイルは読み込み時に
     * 実際のデータ範囲も確認する。
     * ヘッダー位置の重複は先に検出する。
     */

    const sortedOffsets = entries
        .map(entry => entry.localOffset)
        .sort((a, b) => a - b);


    for(let i = 1; i < sortedOffsets.length; i++){

        if(sortedOffsets[i] === sortedOffsets[i - 1]){

            throw new Error(
                "ZIP内でファイル位置が重複しています。"
            );

        }

    }


    /* =================================================
       backup.json の確認
    ================================================= */

    const jsonEntry = entryMap.get("backup.json");


    if(!jsonEntry){

        throw new Error(
            "backup.json が見つかりません。"
        );

    }


    const jsonResult = await readZipEntry(
        file,
        jsonEntry,
        centralOffset
    );


    const jsonText = await jsonResult.blob.text();

    let manifest;


    try{

        manifest = JSON.parse(jsonText);

    }catch(error){

        throw new Error(
            "backup.json を解析できません。"
        );

    }


    validateManifest(manifest);


    /* =================================================
       ZIP内のファイル構成を照合
    ================================================= */

    const expectedPaths = new Set([
        "backup.json"
    ]);


    for(const metadata of manifest.media){

        expectedPaths.add(
            metadata.backupPath
        );

    }


    if(expectedPaths.size !== entries.length){

        throw new Error(
            "ZIP内のファイル数とバックアップ情報が一致しません。"
        );

    }


    for(const entry of entries){

        if(!expectedPaths.has(entry.name)){

            throw new Error(
                "バックアップ情報にないファイルがあります: " +
                entry.name
            );

        }

    }


    /* =================================================
       メディアの読み込み
    ================================================= */

    const restoredMedia = [];

    const checkedPaths = new Set();

    const checkedRanges = [

        {

            start: jsonEntry.localOffset,

            end: jsonResult.end

        }

    ];

    let mediaSize = 0;


    for(const metadata of manifest.media){

        const path = metadata.backupPath;


        if(checkedPaths.has(path)){

            throw new Error(
                "メディアの保存先が重複しています: " +
                path
            );

        }

        checkedPaths.add(path);


        if(!path.startsWith("media/")){

            throw new Error(
                "メディアの保存先が不正です: " +
                path
            );

        }


        const entry = entryMap.get(path);


        if(!entry){

            throw new Error(
                "メディアファイルが見つかりません: " +
                path
            );

        }


        if(entry.size !== metadata.size){

            throw new Error(
                "メディアのサイズが一致しません: " +
                path
            );

        }


        const result = await readZipEntry(
            file,
            entry,
            centralOffset
        );


        /*
         * ZIP内のファイル範囲が重なっていないか確認
         */

        for(const range of checkedRanges){

            if(
                result.start < range.end &&
                result.end > range.start
            ){

                throw new Error(
                    "ZIP内のファイル領域が重複しています: " +
                    path
                );

            }

        }


        checkedRanges.push({

            start: result.start,

            end: result.end

        });


        const restoredBlob = new Blob(

            [result.blob],

            {

                type: metadata.type

            }

        );


        restoredMedia.push({

            ...metadata,

            file: restoredBlob

        });


        mediaSize += restoredBlob.size;

    }


    /* =================================================
       全ファイル検査件数
    ================================================= */

    if(checkedRanges.length !== entries.length){

        throw new Error(
            "ZIP内の検査件数が一致しません。"
        );

    }


    /* =================================================
       復元用データ
    ================================================= */

    const backupData = {

        format: "oshi-app-restore-data",

        version: 1,

        createdAt: manifest.createdAt,

        mainData: manifest.mainData,

        localStorage: manifest.localStorage,

        media: restoredMedia,

        summary: manifest.summary || {}

    };


    /* =================================================
       内容確認情報
    ================================================= */

    const report = {

        valid: true,

        filename: file.name || "backup.zip",

        zipSize: file.size,

        createdAt: manifest.createdAt,

        mainDataItems:
            Object.keys(manifest.mainData),

        localStorageItems:
            Object.keys(manifest.localStorage),

        mediaCount: restoredMedia.length,

        mediaSize: mediaSize,

        mediaTypes: {},

        zipEntryCount: entries.length,

        checkedCRCCount: entries.length

    };


    for(const item of restoredMedia){

        const type = item.type || "unknown";

        report.mediaTypes[type] =
            (report.mediaTypes[type] || 0) + 1;

    }


    return {

        report: report,

        backupData: backupData

    };

}


/* =====================================================
   10. BackupManager へ機能追加
===================================================== */

if(!window.BackupManager){

    throw new Error(
        "BackupManager が見つかりません。"
    );

}


window.BackupManager.inspectBackupFile =
    inspectBackupFile;


})();


/* =====================================================
   💾 バックアップ復元・読み込み
   backup-restore.js

   第1段階：
   ・ZIPファイルの読み込み
   ・backup.json の解析
   ・写真・動画の読み込み
   ・ファイルサイズの検証
   ・CRC32による完全性検証
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

for(let n=0;n<256;n++){

    let c=n;

    for(let k=0;k<8;k++){

        c=(c&1)
            ? 0xEDB88320^(c>>>1)
            : c>>>1;

    }

    CRC_TABLE[n]=c>>>0;

}


/* =====================================================
   2. CRC32 計算
===================================================== */

async function calculateCRC32(blob){

    let crc=0xFFFFFFFF;

    const reader=blob.stream().getReader();

    while(true){

        const {done,value}=await reader.read();

        if(done) break;

        for(let i=0;i<value.length;i++){

            crc=
                CRC_TABLE[(crc^value[i])&0xFF]
                ^(crc>>>8);

        }

    }

    return (crc^0xFFFFFFFF)>>>0;

}


/* =====================================================
   3. ZIP読み込み補助
===================================================== */

const decoder=new TextDecoder("utf-8");


async function readBytes(blob,start,end){

    return new Uint8Array(
        await blob.slice(start,end).arrayBuffer()
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
   4. ZIP中央ディレクトリの検索
===================================================== */

async function findEndRecord(file){

    const searchSize=Math.min(file.size,65557);

    const start=file.size-searchSize;

    const bytes=await readBytes(
        file,
        start,
        file.size
    );

    const view=makeView(bytes);

    for(let i=bytes.length-22;i>=0;i--){

        if(view.getUint32(i,true)===0x06054B50){

            const commentLength=view.getUint16(i+20,true);

            if(i+22+commentLength===bytes.length){

                return {

                    diskNumber:view.getUint16(i+4,true),

                    centralDisk:view.getUint16(i+6,true),

                    diskEntries:view.getUint16(i+8,true),

                    totalEntries:view.getUint16(i+10,true),

                    centralSize:view.getUint32(i+12,true),

                    centralOffset:view.getUint32(i+16,true)

                };

            }

        }

    }

    throw new Error(
        "ZIPの終了情報が見つかりません。"
    );

}


/* =====================================================
   5. ZIP中央ディレクトリの解析
===================================================== */

async function readCentralDirectory(file){

    const end=await findEndRecord(file);

    if(
        end.diskNumber!==0 ||
        end.centralDisk!==0 ||
        end.diskEntries!==end.totalEntries
    ){

        throw new Error(
            "分割ZIPには対応していません。"
        );

    }

    if(
        end.totalEntries===0xFFFF ||
        end.centralOffset===0xFFFFFFFF ||
        end.centralSize===0xFFFFFFFF
    ){

        throw new Error(
            "ZIP64形式には対応していません。"
        );

    }

    if(
        end.centralOffset+end.centralSize>file.size
    ){

        throw new Error(
            "ZIPの中央ディレクトリ位置が不正です。"
        );

    }


    const entries=[];

    let offset=end.centralOffset;


    for(let i=0;i<end.totalEntries;i++){

        const header=await readBytes(
            file,
            offset,
            offset+46
        );

        if(header.length!==46){

            throw new Error(
                "ZIP中央ディレクトリが途中で切れています。"
            );

        }

        const view=makeView(header);

        if(view.getUint32(0,true)!==0x02014B50){

            throw new Error(
                "ZIP中央ディレクトリの形式が不正です。"
            );

        }

        const flags=view.getUint16(8,true);

        const method=view.getUint16(10,true);

        const crc=view.getUint32(16,true);

        const compressedSize=view.getUint32(20,true);

        const size=view.getUint32(24,true);

        const nameLength=view.getUint16(28,true);

        const extraLength=view.getUint16(30,true);

        const commentLength=view.getUint16(32,true);

        const diskStart=view.getUint16(34,true);

        const localOffset=view.getUint32(42,true);


        if(flags&1){

            throw new Error(
                "暗号化されたZIPには対応していません。"
            );

        }

        if(method!==0){

            throw new Error(
                "無圧縮形式以外のZIPには対応していません。"
            );

        }

        if(
            compressedSize!==size ||
            diskStart!==0
        ){

            throw new Error(
                "ZIP内のファイル情報が不正です。"
            );

        }


        const nameBytes=await readBytes(
            file,
            offset+46,
            offset+46+nameLength
        );

        const name=decoder.decode(nameBytes);


        if(
            !name ||
            name.startsWith("/") ||
            name.includes("\\") ||
            name.split("/").includes("..")
        ){

            throw new Error(
                "安全でないファイル名が含まれています。"
            );

        }


        entries.push({

            name:name,

            flags:flags,

            method:method,

            crc:crc,

            compressedSize:compressedSize,

            size:size,

            localOffset:localOffset

        });


        offset+=
            46+
            nameLength+
            extraLength+
            commentLength;

    }


    if(offset!==end.centralOffset+end.centralSize){

        throw new Error(
            "ZIP中央ディレクトリのサイズが一致しません。"
        );

    }


    return entries;

}


/* =====================================================
   6. ZIP内ファイルの読み取り
===================================================== */

async function readZipEntry(file,entry){

    const header=await readBytes(
        file,
        entry.localOffset,
        entry.localOffset+30
    );

    if(header.length!==30){

        throw new Error(
            "ZIPファイルのヘッダーが不完全です。"
        );

    }

    const view=makeView(header);

    if(view.getUint32(0,true)!==0x04034B50){

        throw new Error(
            "ZIPファイルのヘッダーが不正です。"
        );

    }

    const flags=view.getUint16(6,true);

    const method=view.getUint16(8,true);

    const nameLength=view.getUint16(26,true);

    const extraLength=view.getUint16(28,true);


    if(
        flags!==entry.flags ||
        method!==entry.method
    ){

        throw new Error(
            "ZIPヘッダー情報が一致しません: "+entry.name
        );

    }


    const nameBytes=await readBytes(
        file,
        entry.localOffset+30,
        entry.localOffset+30+nameLength
    );

    const localName=decoder.decode(nameBytes);

    if(localName!==entry.name){

        throw new Error(
            "ZIP内のファイル名が一致しません。"
        );

    }


    const dataStart=
        entry.localOffset+
        30+
        nameLength+
        extraLength;

    const dataEnd=dataStart+entry.compressedSize;


    if(dataEnd>file.size){

        throw new Error(
            "ファイルデータがZIPの範囲外です: "+entry.name
        );

    }


    const blob=file.slice(dataStart,dataEnd);


    if(blob.size!==entry.size){

        throw new Error(
            "ファイルサイズが一致しません: "+entry.name
        );

    }


    const actualCRC=await calculateCRC32(blob);

    if(actualCRC!==entry.crc){

        throw new Error(
            "CRC32が一致しません: "+entry.name
        );

    }


    return blob;

}


/* =====================================================
   7. バックアップJSONの検証
===================================================== */

function validateManifest(manifest){

    if(
        !manifest ||
        manifest.format!=="oshi-app-backup"
    ){

        throw new Error(
            "バックアップファイルの形式が正しくありません。"
        );

    }

    if(manifest.version!==1){

        throw new Error(
            "対応していないバックアップ形式です。"
        );

    }

    if(
        !manifest.mainData ||
        typeof manifest.mainData!=="object" ||
        Array.isArray(manifest.mainData)
    ){

        throw new Error(
            "メインデータが不正です。"
        );

    }

    if(
        !manifest.localStorage ||
        typeof manifest.localStorage!=="object" ||
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

    for(const item of manifest.media){

        if(
            !item ||
            item.id===undefined ||
            typeof item.backupPath!=="string" ||
            !Number.isFinite(item.size) ||
            item.size<0 ||
            typeof item.type!=="string"
        ){

            throw new Error(
                "メディア情報に不正な項目があります。"
            );

        }

    }

}


/* =====================================================
   8. ZIPバックアップの読み込み
===================================================== */

async function inspectBackupFile(file){

    if(!(file instanceof Blob)){

        throw new Error(
            "バックアップファイルを指定してください。"
        );

    }

    if(file.size<22){

        throw new Error(
            "ファイルサイズが小さすぎます。"
        );

    }


    /* ZIP一覧 */

    const entries=await readCentralDirectory(file);

    const entryMap=new Map();

    for(const entry of entries){

        if(entryMap.has(entry.name)){

            throw new Error(
                "ZIP内に重複したファイルがあります: "+entry.name
            );

        }

        entryMap.set(entry.name,entry);

    }


    /* backup.json */

    const jsonEntry=entryMap.get("backup.json");

    if(!jsonEntry){

        throw new Error(
            "backup.json が見つかりません。"
        );

    }


    const jsonBlob=await readZipEntry(file,jsonEntry);

    const jsonText=await jsonBlob.text();

    let manifest;

    try{

        manifest=JSON.parse(jsonText);

    }catch(error){

        throw new Error(
            "backup.json を解析できません。"
        );

    }


    validateManifest(manifest);


    /* メディアの読み込み */

    const restoredMedia=[];

    const checkedPaths=new Set();

    let mediaSize=0;


    for(const metadata of manifest.media){

        const path=metadata.backupPath;

        if(checkedPaths.has(path)){

            throw new Error(
                "メディアの保存先が重複しています: "+path
            );

        }

        checkedPaths.add(path);


        if(!path.startsWith("media/")){

            throw new Error(
                "メディアの保存先が不正です: "+path
            );

        }


        const entry=entryMap.get(path);

        if(!entry){

            throw new Error(
                "メディアファイルが見つかりません: "+path
            );

        }


        if(entry.size!==metadata.size){

            throw new Error(
                "メディアのサイズが一致しません: "+path
            );

        }


        const blob=await readZipEntry(file,entry);


        restoredMedia.push({

            ...metadata,

            file:new Blob(
                [blob],
                {
                    type:metadata.type
                }
            )

        });

        mediaSize+=blob.size;

    }


    /* ZIP内のメディア件数確認 */

    const zipMediaEntries=entries.filter(entry=>
        entry.name.startsWith("media/")
    );

    if(zipMediaEntries.length!==manifest.media.length){

        throw new Error(
            "ZIP内のメディア件数とJSONの記録が一致しません。"
        );

    }


    /* 復元用データ */

    const backupData={

        format:"oshi-app-restore-data",

        version:1,

        createdAt:manifest.createdAt,

        mainData:manifest.mainData,

        localStorage:manifest.localStorage,

        media:restoredMedia,

        summary:manifest.summary || {}

    };


    /* 内容確認情報 */

    const report={

        valid:true,

        filename:file.name || "backup.zip",

        zipSize:file.size,

        createdAt:manifest.createdAt,

        mainDataItems:
            Object.keys(manifest.mainData),

        localStorageItems:
            Object.keys(manifest.localStorage),

        mediaCount:restoredMedia.length,

        mediaSize:mediaSize,

        mediaTypes:{},

        zipEntryCount:entries.length,

        checkedCRCCount:entries.length

    };


    for(const item of restoredMedia){

        const type=item.type || "unknown";

        report.mediaTypes[type]=
            (report.mediaTypes[type] || 0)+1;

    }


    return {

        report:report,

        backupData:backupData

    };

}


/* =====================================================
   9. BackupManager へ機能追加
===================================================== */

if(!window.BackupManager){

    throw new Error(
        "BackupManager が見つかりません。"
    );

}

window.BackupManager.inspectBackupFile=
    inspectBackupFile;


})();

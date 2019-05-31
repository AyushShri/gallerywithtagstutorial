/*
This script scales down images above an specified size in a Dropbox folder
and moves the larger original ones to a /highres folder in the same folder path
To use it, change the following constants at your convenience
FOLDER_PATH 
LIMIT_SIZE (in bytes)

and run using the following command:
node -e 'require("./scaledownimgscript").run()'
*/

//token will be read from .env file
require('dotenv').config({silent: true});

// Folder in Dropbox for images to be scaled down
const FOLDER_PATH = '/photos';

// Number of results when listing files from Dropbox
const PAGINATION_SIZE = 20;

// Anything beyond this limit will be resized according to options below
const LIMIT_SIZE = 6000000;  // in bytes

// Parameters to configure the thumbnail download
const FORMAT = 'jpeg';
const SIZE = 'w2048h1536';
const MODE = 'fitone_bestfit';

// Initialization of Dropbox SDK
const
Dropbox = require('dropbox').Dropbox,
fetch = require('isomorphic-fetch'),
config = {
  fetch: fetch,
  accessToken: process.env.DBX_TOKEN
};
var dbx = new Dropbox(config);


// Entry point for the script
module.exports.run = async () =>{
  try{

    let has_more = true;
    let cursor = null;
    let counter = 0;     // keeps track of number of imgs resized 

    while(has_more){

      let files_list;

      // Get the next page of files from Dropbox
      if(!cursor){ 
        let params = { path: FOLDER_PATH, limit: PAGINATION_SIZE };
        files_list = await dbx.filesListFolder(params);

      }else{
        files_list = await dbx.filesListFolderContinue({cursor:cursor});
      }

      cursor = files_list.cursor;
      has_more = files_list.has_more;

      let imgs_paths = filterOverSizedImgsInDropboxResult(files_list.entries);

      for(let i = 0; i < imgs_paths.length; i++){

        let path = imgs_paths[i];

        //1. donwload a lower resolution version of the file
        let thumbnail = await downloadThumbnailAsync(path);

        //2. upload the lowres file to Dropbox in the same folder
        let upload_response = await uploadFileAsync(path, thumbnail.fileBinary);

        //3. move original file to a /highres folder within the folder of origin
        await moveFileAsync(path);

        console.log('resized and moved ' + path);

        counter++;
      } 
    }

    console.log("Finished! Resized " + counter + " images");
    
  }catch(error){
    console.log('!! Encountered error, aborting');
    console.log(error);
  }
}

//Filters an array of entries returning only the paths to imgages
function filterOverSizedImgsInDropboxResult(entries){

  let imgs_paths = [];
  for(let i = 0; i < entries.length; i++) {
    entry = entries[i];
    if(entry.path_lower.search(/\.(gif|jpg|jpeg|tiff|png)$/i) == -1) continue;
    if(entry.size > LIMIT_SIZE ){
      imgs_paths.push(entry.path_lower);
    }
  }

  return imgs_paths;
}

// Downloads a thumbnail from Dropbox for a given path
async function downloadThumbnailAsync(path){

  let download_params = { 
    path: path,
    format: FORMAT, 
    size: SIZE, 
    mode: MODE 
  }

  return dbx.filesGetThumbnail(download_params);
}

// Uploads a file in Dropbox in a given path
async function uploadFileAsync(path,fileBinary){

  let upload_params = {
    //the picture will be added the _lowres sufix
    path : path.substr(0, path.lastIndexOf('.')) + '_lowres.jpg',
    contents : fileBinary,
    autorename: true,
    mute: true
  }

  return dbx.filesUpload(upload_params);
}

// Moves an image to a /highres folder within the original folder
async function moveFileAsync(path){

  let move_params = {
    from_path : path,
    //regex for the last / in the path
    to_path : path.replace(/\/(?!.*\/)/, "/highres/"),
    autorename : true
  };

  return dbx.filesMoveV2(move_params);
}

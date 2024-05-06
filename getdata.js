const { ethers } = require("ethers");
const fs = require('fs');
const prompt = require('prompt-sync')();


const prov="http://localhost:8090/ethereum"
const provider = new ethers.JsonRpcProvider(prov)

const errorFolderPath =/*the path of the file where the data will be written*/

function writeErrorToFile(errorMessage) {
    const errorData = `${new Date().toISOString()}: ${errorMessage}\n`;

    fs.appendFileSync(/*the name of the file where the error logs are writen*/, errorData);
    console.log('Error written to error log.');
}

function containsAddress(obj, address) {
  if (typeof obj === 'string') {
      return /^0x[a-fA-F0-9]{40}$/.test(obj) && obj.toLowerCase() === address.toLowerCase();
  } else if (typeof obj === 'object' && obj !== null) {
      for (let key in obj) {
          if (obj.hasOwnProperty(key)) {
              if (containsAddress(obj[key], address)) {
                  return true;
              }
          }
      }
  }
  return false;
}


function updateProgressBar(progress) {
    const barLength = 50;
    const completed = Math.floor((progress / 100) * barLength);
    const remaining = barLength - completed;
    const progressBar = '[' + '='.repeat(completed) + '>'.repeat(progress === 100 ? 0 : 1) + ' '.repeat(remaining) + ']';
    process.stdout.write(`\r${progressBar} ${progress}%`);
}


function storecalls(curtrans){
  let call_list=[]
  let curcall=curtrans.calls
  for(let i=0; i<curcall.length;i++){
      let input="0x00000000"
      let etherValue = '0.0';
      if(curcall[i].input!=''){
          input=curcall[i].input.match(/^.+?(?=00|$)/)[0]
      }

      if(curcall[i].value!=undefined){
          etherValue = ethers.formatEther(curcall[i].value); 
      }
      let tr={"to" : curcall[i].to,
              "from" : curcall[i].from,
              "value": etherValue,
              "gas": ethers.formatEther(curcall[i].gasUsed),
              "input": input
      }
      call_list.push(tr)

      if(curcall[i].calls!=undefined){
          let prev_calls=storecalls(curcall[i])
          if(prev_calls.length>0)
          call_list.push(prev_calls)
      }
  }
  return call_list;
}


function makelist(intcalls, sttrans){
  let input="0x00000000"
      let etherValue = '0.0';
      if(sttrans.input!=''){
          input=sttrans.input.match(/^.+?(?=00|$)/)[0]
      }
      if(sttrans.value!=undefined){
          etherValue = ethers.formatEther(sttrans.value); 
      }
  let tr={"to" : sttrans.to,
              "from" : sttrans.from,
              "value": etherValue,
              "gas": ethers.formatEther(sttrans.gasUsed),
              "input": input
      }
  return [tr,[intcalls]];
}

function readJSONFile(filename) {
    try {
        const data = fs.readFileSync(filename);
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading JSON file:', err);
        writeErrorToFile(err.message);
        return [];
    }
}

function writeJSONFile(filename, data) {
    try {
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log('Data written to JSON file successfully.');
    } catch (err) {
        console.error('Error writing JSON file:', err);
        writeErrorToFile(err.message);
    }
}

const blocknum=/*the block from which the scanning will start*/
const address=/*the address of the smart contract*/
const filename=/*the name of the file the data is stored in*/
const numrepeats=/*the number of blocks that will be scanned*/



async function getblockdata(blocnum){
    
    console.log("Starting to get data")
    let pastlist=[]
    console.log("block no.", blocnum);
    try{
        let block = await provider.getBlock(blocnum, true);
    
    
    for(i=0; i<Number(block.transactions.length); i++){
        let transinfo=block.prefetchedTransactions[i];
        let functionlist=[]
        let blocknum=block.number;
        let TxHash=transinfo.hash;
        // console.log("hash: ", TxHash)
        if(transinfo.data!="0x"){
            try{    
                let moretransinfo=await provider.getTransactionReceipt(transinfo.hash)
                // if(moretransinfo.status==1 && attackhash.includes(TxHash)){
                if(moretransinfo.status==1){
                    const traceData = await provider.send('debug_traceTransaction', [TxHash, {"tracer": "callTracer"},]);
                    if(containsAddress(traceData, address)){
                        functionlist=makelist(storecalls(traceData), traceData);
                    }
                }       
            } catch (err) {
                console.error('Error getting debug_traceTransaction:', err);
                writeErrorToFile(err.message);
            }
        
        }
        if(functionlist.length!=0){
            pastlist.push({"BlockNumber":blocknum, "TxHash": TxHash, "CallList": functionlist})
            functionlist=[]
        }

        const progress = Math.floor((i / Number(block.transactions.length)) * 100);

        // Update progress bar
        updateProgressBar(progress);
    }
    console.log("\nLength of list: ", pastlist.length);
    
    return pastlist;
    } catch (err) {
        console.error('Error reading block:', err);
        writeErrorToFile(err.message);
    }
  };
  



async function main(){
    pastlist=readJSONFile(filename);
    const startTime = performance.now();
    for(let i=0; i<numrepeats; i++){
        let curblock=blocknum-i;
        let newlist = await getblockdata(curblock);
        if(newlist.length>0){
            pastlist.push(newlist);
            writeJSONFile(filename, pastlist);
        }
        let endTime = performance.now(); // Record end time
        let executionTime = endTime - startTime;
        let seconds = Math.floor(executionTime / 1000);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);

        // Adjusting values to display in reverse order
        seconds %= 60;
        minutes %= 60;
        hours %= 24;

        console.log(`Function is running for: ${hours} hours ${minutes} minutes ${seconds} seconds`);
    }
}


  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
  
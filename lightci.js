#! /usr/bin/env node

const GitHubApi = require('github')
const async = require('async')
const clone = require('git-clone');
const exec = require('child_process').exec;
const fs = require('fs.extra');
require('console-stamp')(console, {pattern:'yyyy/mm/dd HH:MM:ss', labelPrefix: '', labelSuffix: ''});

var conf = {}

const github = new GitHubApi();

var getRepos = function() {
    return github.repos.getAll({per_page:100}).then(res=>{
        var repos = res.data

        var ownedRepos = repos.reduce((prev,curr)=>{
            if(conf.owner){
                if(curr.owner.login == conf.owner){
                    prev.push(curr);
                    return prev;
                } 
            }
            if (conf.repos) {
                if(conf.repos.indexOf(curr.full_name)>=0){
                    prev.push(curr);
                    return prev;
                }
            }
            return prev;
        },[])

        if(conf.ignore){
            ownedRepos = ownedRepos.reduce((prev,curr)=>{
                if(conf.ignore.indexOf(curr.full_name)<0) prev.push(curr);
                return prev;
            },[]);
        }

        return selectReposToWatch(ownedRepos);
    })
}

var selectReposToWatch = function (ownedRepos){
    return new Promise((resolve,reject)=>{

        var watchedRepos = [];
        async.each(ownedRepos,(repo,callback)=>{
            github.repos.getContent({owner:repo.owner.login, repo:repo.name, path: ''}).then(res=>{
                var watchThis = false;
                res.data.forEach(file=>{
                    fname = file.name.split('.');
                    if(fname[0] == 'light' || fname[0] == conf.name && fname[1] == 'sh') watchThis = true;
                });
                if(watchThis) watchedRepos.push(repo);
                callback();
            }, err=>{
                var message = JSON.parse(err.message).message;
                if(message != "This repository is empty.") console.log(err.message)
                callback();
            });
        },(err)=>{
            if(err) reject(err);
            else {
                resolve(watchedRepos);
            }
        })
    })
}

var checkRepos = function(watchedRepos){
    return new Promise((resolve,reject)=>{
        var jobsToDo = [];
        async.each(watchedRepos,(repo, callback)=>{
            github.repos.getCommits({owner:repo.owner.login, repo:repo.name}).then(res=>{
                var commit = res.data[0];
                var mostRecentSHA = commit.sha;
                var assignee = commit.author.login;
                github.repos.getStatuses({owner:repo.owner.login, repo:repo.name,sha:mostRecentSHA,ref:mostRecentSHA}).then(res=>{
                    if(res.data.length == 0) {
                        github.repos.createStatus({owner:repo.owner.login, repo:repo.name,sha:mostRecentSHA,ref:mostRecentSHA,state:'pending'})
                        repo.latestCommit = commit;
                        jobsToDo.push(repo)
                    }
                    callback();
                });
            });
        },err=>{
            if(err) reject(err);
            else {
                resolve(jobsToDo);
            }
        });
    })
}

var runJobs = function(jobsToDo){
    jobsToDo.forEach(repo=>{
        runJob(repo).then(buildResult=>{
            if(buildResult.success) {
                github.repos.createStatus({owner:repo.owner.login, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:'success'});
                closeBuildIssues(repo,repo.latestCommit.sha);
                console.log('Build succeeded for ' + repo.full_name)
            }
            else {
                github.repos.createStatus({owner:repo.owner.login, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:"failure"});
                createIssue(repo,repo.latestCommit.sha,buildResult.stdout,buildResult.stderr,repo.latestCommit.author.login);
                console.log('Build failed for ' + repo.full_name);
                console.log('stdout:');
                console.log(buildResult.stdout);
                console.log('stderr:');
                console.log(buildResult.stderr);
            }
        });
    });
}

var createIssue = function(repo,sha,stdout,stderr,assignee){

    var title = "Build test failed for commit "+sha.substring(0,7);
    var body = "# Build test failed\n Commit " + sha + " failed build testing\n # Output\n ## stdout\n ```\n"+stdout+"``` \n## stderr\n ```\n"+stderr+"```";
    
    github.issues.create({owner:repo.owner.login, repo:repo.name, title:title, body:body, labels:["Build Failed"],assignee:assignee});
}

var closeBuildIssues = function(repo, fixedBy){
    github.issues.getForRepo({owner:repo.owner.login,repo:repo.name,state:"open",labels:"Build Failed"}).then(res=>{
        var issues = res.data;
        issues.forEach(issue=>{
            github.issues.createComment({owner:repo.owner.login,repo:repo.name,number:issue.number,body: "Resolved with commit " + fixedBy})
            github.issues.edit({owner:repo.owner.login,repo:repo.name,number:issue.number, state:"closed"})
        })
    });
}

var runJob = function(repo){
    return new Promise((resolve,reject)=>{
        console.log('Running build for ' + repo.full_name)

        var localPath = './work/' + repo.name + '/';
        fs.rmrfSync(localPath);
        clone(repo.ssh_url,localPath,{},(err)=>{
            if(err) console.log(err)

            exec('sh light.sh', {cwd:localPath}, (err, stdout, stderr) => {
                var success = true;
                if (err) success=false;
                
                fs.rmrfSync(localPath);

                resolve({success: success, stdout:stdout,stderr:stderr});
              });
        })
    });
}

var checkRateLimit = function(){
    return new Promise((resolve,reject)=>{
        github.misc.getRateLimit({}).then(res=>{
            var remaining = res.data.rate.remaining;
            var resumeTime = new Date(res.data.rate.reset*1000);
    
            console.log(remaining + " GitHub API requests remaining this hour");
    
            if(remaining>50) resolve()
            else reject('GitHub Rate limit exceeded, LightCI will resume at ' + resumeTime);
        });
    });
}

var printError = function(err){console.warn(err)};


var execute = function(){
    
    checkRateLimit()
    .then(getRepos,printError)
    .then(checkRepos,printError)
    .then(runJobs,printError);
    
    setTimeout(execute,conf.frequency);
}

var init = function(confIn){
    conf = confIn;
    
    if(!conf.owner && !conf.repos) {console.error('No repositories of repository owner specified'); return 1;}
    if(!conf.authentication) {console.error('No authentication method specified'); return 1;}
    if(!conf.frequency) {console.warn('No frequency specified, defaulting to 10 minute checking intervals'); conf.frequency = 600000}

    github.authenticate(conf.authentication);

    execute();
}

module.exports = init;
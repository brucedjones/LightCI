var GitHubApi = require('github')
var async = require('async')

var conf = require('./light.json')

var github = new GitHubApi();

github.authenticate(conf.authentication);

var watchedRepos = [];
var jobsToDo = [];

var getRepos = function() {
    github.repos.getAll({per_page:100}).then(res=>{
        var repos = res.data
    
        ownedRepos = repos.reduce((prev,curr)=>{
            if(curr.owner.login == conf.owner) prev.push(curr);
            return prev;
        },[])
    
        ownedRepos.forEach(repo=>{
            github.repos.getContent({owner:conf.owner, repo:repo.name, path: ''}).then(res=>{
                res.data.forEach(file=>{
                    fname = file.name.split('.');
                    if(fname[0] == 'light' || fname[0] == conf.name && fname[1] == 'sh') watchedRepos.push(repo);
                })
    
                // console.log("Watching:")
                // watchedRepos.forEach(repo=>{
                //     console.log(repo.full_name);
                // })
                checkRepos();
            }, err=>{
                var message = JSON.parse(err.message).message;
                if(message != "This repository is empty.") console.log(err.message)
            })
        });
    },err=>{console.log(err)})
}

var checkRepos = function(){
    watchedRepos.forEach(repo=>{
        github.repos.getCommits({owner:conf.owner, repo:repo.name}).then(res=>{
            var commit = res.data[0];
            var mostRecentSHA = commit.sha;
            var assignee = commit.author.login;
            github.repos.getStatuses({owner:conf.owner, repo:repo.name,sha:mostRecentSHA,ref:mostRecentSHA}).then(res=>{
                if(res.data.length == 0) {
                    github.repos.createStatus({owner:conf.owner, repo:repo.name,sha:mostRecentSHA,ref:mostRecentSHA,state:'pending'})
                    repo.latestCommit = commit;
                    jobsToDo.push(repo)
                }
            });
        });
    })
}

var runJobs = function(){
    jobsToDo.forEach(repo=>{
        var buildResult = runJob(repo);
        if(buildResult.success) {
            github.repos.createStatus({owner:conf.owner, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:'success'});
            closeBuildIssues(repo,repo.latestCommit.sha);
        }
        else {
            github.repos.createStatus({owner:conf.owner, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:"failure"});
            createIssue(repo,repo.latestCommit.sha,buildResult.output,repo.latestCommit.author.login);
        }
    });
}

var runJob = function(){
    return {success: true, output:"Build ran"};
}

// setTimeout(getRepos,600000)
getRepos();

// setTimeout(checkRepos,600000)
// setTimeout(runJobs,600000)
setTimeout(runJobs,10000)

var createIssue = function(repo,sha,output,assignee){
    var title = "Build test failed for commit "+sha.substring(0,7);
    var body = "# Build test failed\n Commit " + sha + " failed build testing\n # Output \n ```" + output + "```";
    github.issues.create({owner:conf.owner, repo:repo.name, title:title, body:body, labels:["Build Failed"],assignee:assignee});
}

var closeBuildIssues = function(repo, fixedBy){
    github.issues.getForRepo({owner:conf.owner,repo:repo.name,state:"open",labels:"Build Failed"}).then(res=>{
        var issues = res.data;
        issues.forEach(issue=>{
            github.issues.createComment({owner:conf.owner,repo:repo.name,number:issue.number,body: "Resolved with commit " + fixedBy})
            github.issues.edit({owner:conf.owner,repo:repo.name,number:issue.number, state:"closed"})
        })
    });
}


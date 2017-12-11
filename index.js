const GitHubApi = require('github')
const async = require('async')
const clone = require('git-clone');
const exec = require('child_process').exec;
const fs = require('fs.extra');

const conf = require('./light.json')

const github = new GitHubApi();

github.authenticate(conf.authentication);

var jobsToDo = [];

var getRepos = function() {
    return github.repos.getAll({per_page:100}).then(res=>{
        var repos = res.data
    
        var ownedRepos = repos.reduce((prev,curr)=>{
            if(curr.owner.login == conf.owner) prev.push(curr);
            return prev;
        },[])

        return selectReposToWatch(ownedRepos);
    })
}

var selectReposToWatch = function (ownedRepos){
    return new Promise((resolve,reject)=>{
        var watchedRepos = [];
        async.each(ownedRepos,(repo,callback)=>{
            github.repos.getContent({owner:conf.owner, repo:repo.name, path: ''}).then(res=>{
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
                github.repos.createStatus({owner:conf.owner, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:'success'});
                closeBuildIssues(repo,repo.latestCommit.sha);
            }
            else {
                github.repos.createStatus({owner:conf.owner, repo:repo.name,sha:repo.latestCommit.sha,ref:repo.latestCommit.sha,state:"failure"});
                createIssue(repo,repo.latestCommit.sha,buildResult.stdout,buildResult.stderr,repo.latestCommit.author.login);
            }
        });
    });
}

var createIssue = function(repo,sha,stdout,stderr,assignee){

    var title = "Build test failed for commit "+sha.substring(0,7);
    var body = "# Build test failed\n Commit " + sha + " failed build testing\n # Output\n ## stdout\n ```\n"+stdout+"``` \n## stderr\n ```\n"+stderr+"```";
    
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

var runJob = function(repo){
    return new Promise((resolve,reject)=>{
        var localPath = './work/' + repo.name + '/';
        fs.rmrfSync(localPath);
        clone(repo.html_url,localPath,{},(err)=>{
            if(err) console.log(err)

            exec('sh ' + localPath + 'light.sh', (err, stdout, stderr) => {
                var success = true;
                if (err) success=false;
                
                fs.rmrfSync(localPath);

                resolve({success: success, stdout:stdout,stderr:stderr});
              });
        })
    });
}

// repo = { id: 113466620,
//     name: 'AA',
//     full_name: 'LightCITest/AA',
//     owner:
//      { login: 'LightCITest',
//        id: 34345690,
//        avatar_url: 'https://avatars3.githubusercontent.com/u/34345690?v=4',
//        gravatar_id: '',
//        url: 'https://api.github.com/users/LightCITest',
//        html_url: 'https://github.com/LightCITest',
//        followers_url: 'https://api.github.com/users/LightCITest/followers',
//        following_url: 'https://api.github.com/users/LightCITest/following{/other_user}',
//        gists_url: 'https://api.github.com/users/LightCITest/gists{/gist_id}',
//        starred_url: 'https://api.github.com/users/LightCITest/starred{/owner}{/repo}',
//        subscriptions_url: 'https://api.github.com/users/LightCITest/subscriptions',
//        organizations_url: 'https://api.github.com/users/LightCITest/orgs',
//        repos_url: 'https://api.github.com/users/LightCITest/repos',
//        events_url: 'https://api.github.com/users/LightCITest/events{/privacy}',
//        received_events_url: 'https://api.github.com/users/LightCITest/received_events',
//        type: 'Organization',
//        site_admin: false },
//     private: false,
//     html_url: 'https://github.com/LightCITest/AA',
//     description: null,
//     fork: false,
//     url: 'https://api.github.com/repos/LightCITest/AA',
//     forks_url: 'https://api.github.com/repos/LightCITest/AA/forks',
//     keys_url: 'https://api.github.com/repos/LightCITest/AA/keys{/key_id}',
//     collaborators_url: 'https://api.github.com/repos/LightCITest/AA/collaborators{/collaborator}',
//     teams_url: 'https://api.github.com/repos/LightCITest/AA/teams',
//     hooks_url: 'https://api.github.com/repos/LightCITest/AA/hooks',
//     issue_events_url: 'https://api.github.com/repos/LightCITest/AA/issues/events{/number}',
//     events_url: 'https://api.github.com/repos/LightCITest/AA/events',
//     assignees_url: 'https://api.github.com/repos/LightCITest/AA/assignees{/user}',
//     branches_url: 'https://api.github.com/repos/LightCITest/AA/branches{/branch}',
//     tags_url: 'https://api.github.com/repos/LightCITest/AA/tags',
//     blobs_url: 'https://api.github.com/repos/LightCITest/AA/git/blobs{/sha}',
//     git_tags_url: 'https://api.github.com/repos/LightCITest/AA/git/tags{/sha}',
//     git_refs_url: 'https://api.github.com/repos/LightCITest/AA/git/refs{/sha}',
//     trees_url: 'https://api.github.com/repos/LightCITest/AA/git/trees{/sha}',
//     statuses_url: 'https://api.github.com/repos/LightCITest/AA/statuses/{sha}',
//     languages_url: 'https://api.github.com/repos/LightCITest/AA/languages',
//     stargazers_url: 'https://api.github.com/repos/LightCITest/AA/stargazers',
//     contributors_url: 'https://api.github.com/repos/LightCITest/AA/contributors',
//     subscribers_url: 'https://api.github.com/repos/LightCITest/AA/subscribers',
//     subscription_url: 'https://api.github.com/repos/LightCITest/AA/subscription',
//     commits_url: 'https://api.github.com/repos/LightCITest/AA/commits{/sha}',
//     git_commits_url: 'https://api.github.com/repos/LightCITest/AA/git/commits{/sha}',
//     comments_url: 'https://api.github.com/repos/LightCITest/AA/comments{/number}',
//     issue_comment_url: 'https://api.github.com/repos/LightCITest/AA/issues/comments{/number}',
//     contents_url: 'https://api.github.com/repos/LightCITest/AA/contents/{+path}',
//     compare_url: 'https://api.github.com/repos/LightCITest/AA/compare/{base}...{head}',
//     merges_url: 'https://api.github.com/repos/LightCITest/AA/merges',
//     archive_url: 'https://api.github.com/repos/LightCITest/AA/{archive_format}{/ref}',
//     downloads_url: 'https://api.github.com/repos/LightCITest/AA/downloads',
//     issues_url: 'https://api.github.com/repos/LightCITest/AA/issues{/number}',
//     pulls_url: 'https://api.github.com/repos/LightCITest/AA/pulls{/number}',
//     milestones_url: 'https://api.github.com/repos/LightCITest/AA/milestones{/number}',
//     notifications_url: 'https://api.github.com/repos/LightCITest/AA/notifications{?since,all,participating}',
//     labels_url: 'https://api.github.com/repos/LightCITest/AA/labels{/name}',
//     releases_url: 'https://api.github.com/repos/LightCITest/AA/releases{/id}',
//     deployments_url: 'https://api.github.com/repos/LightCITest/AA/deployments',
//     created_at: '2017-12-07T15:21:20Z',
//     updated_at: '2017-12-08T18:37:27Z',
//     pushed_at: '2017-12-08T19:09:30Z',
//     git_url: 'git://github.com/LightCITest/AA.git',
//     ssh_url: 'git@github.com:LightCITest/AA.git',
//     clone_url: 'https://github.com/LightCITest/AA.git',
//     svn_url: 'https://github.com/LightCITest/AA',
//     homepage: null,
//     size: 0,
//     stargazers_count: 0,
//     watchers_count: 0,
//     language: 'Shell',
//     has_issues: true,
//     has_projects: true,
//     has_downloads: true,
//     has_wiki: true,
//     has_pages: false,
//     forks_count: 0,
//     mirror_url: null,
//     archived: false,
//     open_issues_count: 0,
//     license: null,
//     forks: 0,
//     open_issues: 0,
//     watchers: 0,
//     default_branch: 'master',
//     permissions: { admin: true, push: true, pull: true } };

// runJob(repo).then(res=>{console.log(res)});
getRepos().then(checkRepos).then(runJobs);
